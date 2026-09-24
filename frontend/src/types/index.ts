export interface ServiceItem {
  id: string;
  title: string;
  description: string;
  category: 'jira' | 'github' | 'itsm' | 'crm' | 'devops' | 'reports';
  icon: string; // lucide icon name
  path: string;
}

export interface APILogItem {
  id: number;
  timestamp: string;
  service: string;
  endpoint: string;
  method: string;
  execution_time_ms: float;
  status_code: number;
  payload: string | null;
  response_body: string | null;
  error_message: string | null;
  is_simulated: boolean;
}

export type float = number;
