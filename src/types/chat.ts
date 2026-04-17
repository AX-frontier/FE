export type AgentType = 'main' | 'library' | 'document';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentType?: AgentType;
  timestamp: Date;
  isTyping?: boolean;
  isAgentDiscovery?: boolean;
  isSearching?: boolean;
  documentReview?: DocumentReviewResult;
}

export interface DocumentReviewResult {
  score: number;
  highlights: HighlightItem[];
  sections: {
    header: SectionReview;
    body: SectionReview;
    footer: SectionReview;
  };
  correctedText: string;
}

export interface HighlightItem {
  text: string;
  type: 'error' | 'warning' | 'ok';
  message: string;
}

export interface SectionReview {
  status: 'ok' | 'warning' | 'error';
  label: string;
  description: string;
}

export interface ChatHistory {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}
