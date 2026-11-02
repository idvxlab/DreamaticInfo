import { researchFeedbackLabels } from "../../../packages/shared/research.js";
import { hash } from './validation.js';
export type FeedbackCategory = 'parameter' | 'prerequisite' | 'unavailable' | 'interrupted' | 'internal';
export interface ResearchFeedback { category:FeedbackCategory; code:string; message:string; next_action:string; repeated:number }
export const feedbackLabels=researchFeedbackLabels;
export class ResearchToolError extends Error {
  constructor(readonly code:string,readonly category:FeedbackCategory,message:string,readonly next_action:string){super(message);}
}
export class ResearchToolLoopError extends Error {}
export function researchFeedback(error:unknown, tool:string):ResearchFeedback {
  const message=error instanceof Error?error.message:String(error);
  if(error instanceof ResearchToolError)return {...error,category:error.category,code:error.code,message,next_action:error.next_action,repeated:1};
  let category:FeedbackCategory='internal',code='unexpected',next_action='保留记录并检查内部错误，不要反复重试。';
  if(/AbortError|用户暂停|服务停止|operation was aborted$/i.test(message)){category='interrupted';code='cancelled';next_action='保留当前成果，明确继续任务后再执行。';}
  else if(/HTTP|Timeout|超时|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|响应无效|有效 JSON|没有观测数据|切片.*完整/i.test(message)){category='unavailable';code='source_unavailable';next_action='检查服务状态、访问条件或缩小切片；保留已成功来源，必要时改用相关专门来源并记录缺口。';}
  else if(/先|当前计划|当前调研|来源候选|目录不是|只能|尚未|等待|任务编号不在|对应|已达到/.test(message)){category='prerequisite';code='research_precondition';next_action='调用 read_research_progress，复制有效任务和候选编号，并按返回的 next_action 执行。';}
  else if(/参数|字段|Markdown|编号|表格|重复|填写|必须|不能为空|不支持|许可|无效|关键词|格式|模板|局限|缺口|过期|变化|过长|章节|列表|未知|不能|空|调研草稿|来源元数据|Schema|schema|required|validation/i.test(message)){category='parameter';code='invalid_arguments';next_action=`修正 ${tool} 指出的字段；先读取当前任务、来源目录或 Markdown 模板，不要原样重发。`;}
  return {category,code,message,next_action,repeated:1};
}
/** Rejected identical calls cannot repeatedly hit the network in unchanged state. */
const stableArguments=(value:unknown):unknown => Array.isArray(value) ? value.map(stableArguments) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stableArguments(item)])) : value;
export class ResearchFeedbackPolicy {
  private rejected=new Map<string,ResearchFeedback>();
  nativeRejection(tool:string,args:unknown,error:unknown) {
    const key=hash([tool,stableArguments(args),'native-schema']),prior=this.rejected.get(key),feedback={...researchFeedback(error,tool),repeated:(prior?.repeated ?? 0)+1};
    this.rejected.set(key,feedback);
    if(feedback.repeated>=3)throw new ResearchToolLoopError(`阶段已停止：${tool} 连续重复提交不符合工具参数约定的调用；${feedback.next_action}`);
    return feedback;
  }
  async execute<T>(tool:string,args:unknown,state:string,run:()=>Promise<T>):Promise<{ok:true;value:T}|{ok:false;feedback:ResearchFeedback}> {
    const key=hash([tool,stableArguments(args),state]), prior=this.rejected.get(key);
    if(prior){const feedback={...prior,repeated:prior.repeated+1,next_action:`相同参数与计划状态未变化，未重复执行。${prior.next_action}`};this.rejected.set(key,feedback);if(feedback.repeated>=3)throw new ResearchToolLoopError(`阶段已停止：${tool} 连续重复违反 ${feedback.code}；${prior.next_action}`);return {ok:false,feedback};}
    try {const value=await run();return {ok:true,value};}
    catch(error){if(error instanceof ResearchToolLoopError)throw error;const feedback=researchFeedback(error,tool);if(feedback.category==='internal'||feedback.category==='interrupted')throw error;this.rejected.set(key,feedback);return {ok:false,feedback};}
  }
}
