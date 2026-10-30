export type ChatMessage = {id:string;createdAt:string;senderId:string;body:string;kind:string;objectId?:string;requestId?:string;card?:Record<string,any>};
export function mergeMessages<T extends ChatMessage>(current:T[],incoming:T[]):T[]{
 const byId=new Map(current.map(message=>[message.id,message]));
 for(const message of incoming)byId.set(message.id,message);
 return [...byId.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
