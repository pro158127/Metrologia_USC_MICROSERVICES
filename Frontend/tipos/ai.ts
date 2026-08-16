// ============================================================
// ai.ts
// Tipos del Agente Metrológico (AiAgentWidget).
// ============================================================

export interface Message {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: string;
}

export interface AiAgentWidgetProps {
  /** Contexto opcional de la cotización activa para pasarle datos al agente */
  activeContext?: { codigo: string } | null;
}
