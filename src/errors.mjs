export const serviceError=(message,status=400,code)=>Object.assign(new Error(message),{status,code});
