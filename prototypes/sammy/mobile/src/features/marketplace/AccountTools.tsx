import {useRef,useState} from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Share,Text,View} from 'react-native';
import {ActionButton,Field,ui} from '../../components/FormUI';
import {useLanguage} from '../../i18n/LanguageProvider';
import {commerceApi} from './commerceApi';

export function AccountTools({onBack}:{onBack:()=>void}) {
 const {language}=useLanguage();
 const text=(en:string,zh:string)=>language==='zh'?zh:en;
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[exportReady,setExportReady]=useState<string|null>(null);
 const lock=useRef(false);
 const change=async()=>{
  if(lock.current)return;
  if(password.length<12||password.length>128){setNotice(text('Use a password with 12–128 characters.','密码须为12–128个字符。'));return;}
  if(password!==confirmation){setNotice(text('The new passwords do not match.','两次输入的新密码不一致。'));return;}
  lock.current=true;setBusy(true);setNotice('');
  try{await commerceApi('/me/password',{currentPassword:current,newPassword:password});setCurrent('');setPassword('');setConfirmation('');setNotice(text('Password changed. Your other sessions have been signed out.','密码已更改，其他设备已退出登录。'));}
  catch(e){setNotice(e instanceof Error&&e.message==='invalidCredentials'?text('Your current password is incorrect.','当前密码不正确。'):text('Could not confirm the password change. If the connection was interrupted, try signing in with your new password.','无法确认密码是否更改成功。如连接中断，请尝试使用新密码登录。'));}
  finally{lock.current=false;setBusy(false);}
 };
 const prepareExport=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setNotice('');setExportReady(null);
  try{const data=await commerceApi('/me/export');setExportReady(JSON.stringify(data,null,2));}
  catch{setNotice(text('Could not prepare your data. Please try again.','无法准备你的数据，请重试。'));}
  finally{lock.current=false;setBusy(false);}
 };
 return <KeyboardAvoidingView style={ui.page} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
  <ActionButton secondary label={text('Back','返回')} disabled={busy} onPress={onBack}/>
  <Text style={ui.title}>{text('Account & privacy','账号与隐私')}</Text>
  <View style={ui.card}><Text style={ui.heading}>{text('Change password','更改密码')}</Text>
   <Field label={text('Current password','当前密码')} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" maxLength={128} editable={!busy}/>
   <Field label={text('New password','新密码')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy}/>
   <Field label={text('Confirm new password','确认新密码')} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy}/>
   <Text style={ui.caption}>{text('Use 12–128 characters. Other devices will need to sign in again.','使用12–128个字符。更改后其他设备需重新登录。')}</Text>
   <ActionButton label={text('Save password','保存密码')} busy={busy} disabled={!current||!password||!confirmation} onPress={()=>void change()}/>
  </View>
  <View style={ui.card}><Text style={ui.heading}>{text('Export your data','导出我的数据')}</Text><Text style={ui.body}>{text('Prepare a JSON copy of your profile, orders, messages, applications, favorites and other account records. Passwords and private file links are excluded.','生成包含资料、订单、聊天、申请、收藏等账号记录的JSON副本，不含密码及私密文件链接。')}</Text><ActionButton secondary label={text('Prepare export','准备导出')} disabled={busy} onPress={()=>void prepareExport()}/>
   {exportReady&&<><Text style={ui.caption}>{text('Your export is ready. It contains personal information; choose where to save or share it.','导出数据已就绪，内含个人信息，请选择保存或分享的位置。')}</Text><ActionButton label={text('Save or share data','保存或分享数据')} disabled={busy} onPress={()=>{void Share.share({title:'Xiongzai account data',message:exportReady}).catch(()=>setNotice(text('Could not open sharing. Try again.','无法打开分享，请重试。')));}}/></>}
  </View>{notice&&<Text accessibilityRole="alert" style={ui.body}>{notice}</Text>}
 </ScrollView></KeyboardAvoidingView>;
}
