import * as FileSystem from 'expo-file-system/legacy';
export type PendingMessage={requestId:string;kind:string;text?:string;objectId?:string};
export type ChatDraft={body:string;pending:PendingMessage|null};
const queues=new Map<string,Promise<void>>();
function path(viewer:string,conversation:string){if(!/^[a-f0-9-]{36}$/i.test(viewer)||!/^[a-f0-9-]{36}$/i.test(conversation)||!FileSystem.documentDirectory)throw new Error('storageUnavailable');return FileSystem.documentDirectory+'chat-'+viewer+'-'+conversation+'.json';}
export async function readChatDraft(viewer:string,conversation:string):Promise<ChatDraft>{const file=path(viewer,conversation);if(!(await FileSystem.getInfoAsync(file)).exists)return {body:'',pending:null};const value=JSON.parse(await FileSystem.readAsStringAsync(file));return {body:typeof value.body==='string'?value.body.slice(0,1000):'',pending:value.pending?.requestId?value.pending:null};}
export async function saveChatDraft(viewer:string,conversation:string,draft:ChatDraft){const file=path(viewer,conversation),task=(queues.get(file)??Promise.resolve()).catch(()=>{}).then(()=>FileSystem.writeAsStringAsync(file,JSON.stringify(draft)));queues.set(file,task);try{await task;}finally{if(queues.get(file)===task)queues.delete(file);}}
