import { roles, type Message, type ProjectDetail, type Role } from "../../../packages/shared/types";
export interface ConversationEvent { at: string; text: string; role?: Role }
export const roleNames: Record<Role, string> = { chatbot: "ChatBot", researcher: "Researcher", analyst: "Analyst", designer: "Designer", builder: "Builder" };
export const roleLabels: Record<Role, string> = { chatbot: "需求理解", researcher: "数据调研", analyst: "事实提取", designer: "叙事设计", builder: "作品实现" };
export const documentNames: Record<Role, string> = { chatbot: "intent", researcher: "research", analyst: "datafacts", designer: "design", builder: "delivery" };
type Entry = { kind: "message"; key: string; at: string; message: Message } | { kind: "stage"; key: string; at: string; role: Role };
/** Show real messages and current stage records chronologically; unstarted stages stay out of the conversation. */
export function conversationEntries(project: ProjectDetail): Entry[] {
  const entries: Entry[] = project.messages.map((message, index) => ({ kind: "message", key: `message-${index}`, at: message.at, message }));
  for (const role of roles) {
    const stage = project.state.stages[role];
    if (stage.status === "pending") continue;
    entries.push({ kind: "stage", key: role, at: stage.status === "completed" ? stage.completed_at ?? project.updated_at : project.state.updated_at, role });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function pendingQuestion(project: ProjectDetail | null) {
  const message = project?.messages.at(-1);
  return message?.role === "assistant" && message.question && project?.state.status === "interrupted" ? message : undefined;
}
