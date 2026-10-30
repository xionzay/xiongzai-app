export const games=['peaceElite','deltaForce','honorOfKings','valorant'] as const;
export type Game=typeof games[number];
export const gameName=(game:string,language:string)=>({peaceElite:['Peace Elite','和平精英'],deltaForce:['Delta Force','三角洲行动'],honorOfKings:['Honor of Kings','王者荣耀'],valorant:['VALORANT','无畏契约']}[game]?.[language==='zh'?1:0]??game);
export const serviceTypeName=(type:string,language:string)=>type==='coaching'?(language==='zh'?'教学指导':'Coaching'):(language==='zh'?'游戏陪玩':'Companionship');
export const reviewStatusName=(status:string,language:string)=>({draft:['Draft','草稿'],pending:['Awaiting review','待审核'],approved:['Approved','已通过'],changes_requested:['Changes requested','需修改']}[status]?.[language==='zh'?1:0]??status);
