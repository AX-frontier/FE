import type { AgentType } from '@/types/chat';

export function detectAgent(query: string): AgentType {
  const libraryKeywords = ['도서관', '학술정보관', '도서', '책', '대출', '반납', '전자책', '학술DB', 'DB', '열람실', '좌석', '연체'];
  const documentKeywords = ['결재', '문서', '기안', '공문', '검토', '피드백', '검수', '본문', '붙임', '수신', '발신'];

  const lower = query.toLowerCase();
  if (libraryKeywords.some(k => lower.includes(k))) return 'library';
  if (documentKeywords.some(k => lower.includes(k))) return 'document';
  return 'main';
}

export async function callClaudeAPI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  agentType: AgentType
): Promise<string> {
  const systemPrompts: Record<AgentType, string> = {
    main: `당신은 한성대학교(Hansung University)의 AI 통합 정보 서비스 '한성 AI'입니다. 
학생, 교직원, 교수에게 학교 관련 정보를 친절하고 정확하게 안내합니다.
학사일정, 공지사항, 학교 시설, 부서 연락처, 일반 행정 절차 등에 대해 답변합니다.
모르는 정보에 대해서는 솔직히 말하고 공식 채널을 안내합니다.
답변은 간결하고 명확하게, 필요시 핵심 포인트를 정리해서 제공합니다.`,

    library: `당신은 한성대학교 학술정보관 AI입니다.
도서관 이용 안내(운영시간, 대출/반납, 열람실, 전자자료, 학술DB 등)와 도서 검색을 전문으로 합니다.
도서 관련 질문은 제목, 저자, 분야 등을 기반으로 추천하거나 검색 결과를 안내합니다.
학술정보관 홈페이지(library.hansung.ac.kr) 관련 안내도 포함합니다.
친절하고 구체적으로 답변합니다.`,

    document: `당신은 한성대학교 행정 결재 문서 본문 검토 AI입니다.
공문서 작성 규정과 한성대학교 문서 작성 기준에 따라 제출된 문서를 검토합니다.
두문(수신란, 제목), 본문(목적/배경/요청사항), 결문("끝" 표기, 날짜, 서명) 구조를 점검합니다.
형식 오류, 표현 문제, 누락 항목을 찾아 구체적인 수정 방향을 제시합니다.
검토 결과는 형식 적합도(0-100%), 항목별 상태(두문/본문/결문), 보완 사항 목록으로 제공합니다.`
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompts[agentType],
        messages,
      }),
    });

    const data = await response.json();
    const text = data.content?.map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '').join('') ?? '';
    return text;
  } catch (err) {
    console.error('API error:', err);
    return '죄송합니다. 현재 서비스에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

export function generateChatTitle(query: string): string {
  return query.length > 20 ? query.substring(0, 20) + '...' : query;
}
