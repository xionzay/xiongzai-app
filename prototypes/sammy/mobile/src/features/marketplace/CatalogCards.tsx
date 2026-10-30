import {useEffect,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {money} from '../../components/FormUI';
import {useLanguage} from '../../i18n/LanguageProvider';
import {gameName,serviceTypeName} from './catalog';
import {gameLook,listingCopy,providerCopy} from './catalogPresentation';
import type {PublicListing} from './listingModels';
import type {CommerceObject} from './commerceApi';
import {catalogArtwork} from './catalogArtwork';

export function CatalogCover({game,url,sample=false,serviceType}:{game:string;url?:string|null;sample?:boolean;serviceType?:string}){
 const {language}=useLanguage();const look=gameLook(game);const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 const source=url&&!failed?{uri:url}:catalogArtwork(game,serviceType);
 return <View accessible={false} style={[s.cover,{backgroundColor:look.color}]}>
  {source?<><Image source={source} onError={()=>setFailed(true)} style={StyleSheet.absoluteFill} resizeMode="cover"/><View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(4,16,34,0.24)'}]}/></>:<>
   <View style={[s.orbit,{borderColor:look.accent}]}/><View style={[s.orbitSmall,{borderColor:look.accent}]}/>
   <View style={[s.slash,{backgroundColor:look.accent}]}/><Text style={[s.emblem,{color:look.accent}]}>{look.mark}</Text>
   <Text style={s.coverWord}>{language==='zh'?(serviceType==='coaching'?'一起练习 / 一起进步':'一起开黑 / 一起精彩'):(serviceType==='coaching'?'PLAY / LEARN':'PLAY / TOGETHER')}</Text>
  </>}
  <View style={s.coverTop}><Text style={s.gameTag}>{gameName(game,language)}</Text></View>
  <View style={s.coverBottom}><Text style={s.coverType}>{serviceTypeName(serviceType??'companion',language)}</Text><Text style={s.coverArrow}>↗</Text></View>
 </View>;
}
function Avatar({game,url}:{game:string;url?:string|null}){return <View style={[s.avatar,{backgroundColor:gameLook(game).accent}]}><Image source={url?{uri:url}:require('../../../assets/mascot.png')} style={s.avatarImage} resizeMode="contain"/></View>;}
export function ServiceCard({listing,onPress}:{listing:PublicListing;onPress:()=>void}){
 const {language}=useLanguage();const copy=listingCopy(listing,language);const provider=providerCopy({...listing.provider,isShowcase:listing.isShowcase},listing.game,language);
 const photo=listing.files.find(f=>f.id===(listing.photoMediaIds[0]??listing.provider.avatarMediaId))?.url;
 return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.title}, ${provider.name}, ${money(listing.priceFen,language)}`} onPress={onPress} style={({pressed})=>[s.card,pressed&&s.pressed]}>
  <CatalogCover game={listing.game} url={photo} sample={listing.isShowcase} serviceType={listing.serviceType}/>
  <View style={s.body}><View style={s.providerRow}><Avatar game={listing.game} url={listing.files.find(f=>f.id===listing.provider.avatarMediaId)?.url}/><Text style={s.providerName}>{provider.name}</Text><Text style={s.team}>{language==='zh'?(listing.mode==='duo'?'双排':'组队'):(listing.mode==='duo'?'Duo':'Squad')}</Text></View>
   <Text style={s.title}>{copy.title}</Text><Text numberOfLines={2} style={s.description}>{copy.description}</Text>
   <View style={s.footer}><Text style={s.price}>{money(listing.priceFen,language)}<Text style={s.unit}> / {language==='zh'?'小时':'hr'}</Text></Text><View style={s.open}><Text style={s.openText}>{language==='zh'?'查看服务':'Explore'} ↗</Text></View></View>
  </View>
 </Pressable>;
}
export function CompanionCard({store,onPress}:{store:CommerceObject;onPress:()=>void}){
 const {language}=useLanguage();const game=store.games?.[0]??'peaceElite';const look=gameLook(game);const copy=providerCopy({nickname:store.nickname,bio:store.bio,isShowcase:store.isShowcase},game,language);const avatar=store.files?.find((f:CommerceObject)=>f.id===store.avatarMediaId)?.url;
 return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.name}, ${gameName(game,language)}`} onPress={onPress} style={({pressed})=>[s.card,pressed&&s.pressed]}>
  <View style={[s.companionBanner,{backgroundColor:look.color}]}><Text style={[s.companionMark,{color:look.accent}]}>{look.mark}</Text><Text style={s.gameTag}>{gameName(game,language)}</Text></View>
  <View style={s.body}><View style={s.companionIdentity}><Avatar game={game} url={avatar}/><View style={{flex:1}}><Text style={s.title}>{copy.name}</Text><Text style={s.rating}>{store.reviewCount?`${Number(store.rating).toFixed(1)} ★ · ${store.reviewCount}`:(language==='zh'?'暂无评价':'No reviews yet')}</Text></View><Text style={s.profileArrow}>↗</Text></View>
   <Text numberOfLines={2} style={s.description}>{copy.bio}</Text><View style={s.footer}><Text style={s.price}>{store.minPriceFen!=null?money(store.minPriceFen,language):'—'}<Text style={s.unit}> / {language==='zh'?'小时起':'hr from'}</Text></Text><Text style={s.viewProfile}>{language==='zh'?'认识 TA':'Meet your teammate'}</Text></View>
  </View>
 </Pressable>;
}
const s=StyleSheet.create({
 card:{backgroundColor:'#FFF',borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:'#D6E7F4',shadowColor:'#133F76',shadowOffset:{width:0,height:5},shadowOpacity:0.07,shadowRadius:14,elevation:2},pressed:{opacity:0.85},
 cover:{height:175,overflow:'hidden',padding:16,justifyContent:'space-between'},coverTop:{flexDirection:'row',alignItems:'center',gap:8},gameTag:{color:'#FFF',fontSize:12,fontWeight:'700',backgroundColor:'rgba(0,0,0,0.50)',paddingHorizontal:10,paddingVertical:6,borderRadius:9,overflow:'hidden'},
 orbit:{position:'absolute',width:190,height:190,right:-12,top:-24,borderRadius:95,borderWidth:1,opacity:0.26},orbitSmall:{position:'absolute',width:120,height:120,right:23,top:11,borderRadius:60,borderWidth:1,opacity:0.22},slash:{position:'absolute',right:56,top:-80,width:28,height:320,transform:[{rotate:'35deg'}],opacity:0.12},emblem:{position:'absolute',right:57,top:25,fontSize:76,fontWeight:'300'},coverWord:{position:'absolute',left:17,top:66,fontSize:10,fontWeight:'800',letterSpacing:3,color:'#FFFFFF99'},coverBottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},coverType:{color:'#FFF',fontSize:21,fontWeight:'700'},coverArrow:{color:'#FFF',fontSize:28},
 body:{padding:17,gap:10},providerRow:{flexDirection:'row',alignItems:'center',gap:8},avatar:{width:34,height:34,borderRadius:12,overflow:'hidden',alignItems:'center',justifyContent:'center'},avatarImage:{width:32,height:32},providerName:{fontSize:13,fontWeight:'700',color:'#365C88',flex:1},team:{fontSize:11,color:'#42688E',paddingHorizontal:9,paddingVertical:5,backgroundColor:'#EDF5FC',borderRadius:8},title:{fontSize:19,lineHeight:26,fontWeight:'800',color:'#082E72'},description:{fontSize:14,lineHeight:21,color:'#557492'},footer:{marginTop:4,paddingTop:13,borderTopWidth:1,borderTopColor:'#EDF3F8',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},price:{fontSize:22,fontWeight:'800',color:'#082E72',flexShrink:1},unit:{fontSize:11,fontWeight:'500',color:'#64809A'},open:{backgroundColor:'#E6F3FF',paddingVertical:9,paddingHorizontal:12,borderRadius:12},openText:{color:'#087DEF',fontSize:12,fontWeight:'700'},companionBanner:{height:74,padding:15,flexDirection:'row',alignItems:'flex-start',overflow:'hidden'},companionMark:{position:'absolute',right:65,top:-24,fontSize:100,opacity:0.24},companionIdentity:{flexDirection:'row',alignItems:'center',gap:12},rating:{fontSize:12,color:'#64809A',marginTop:3},profileArrow:{fontSize:25,color:'#087DEF'},viewProfile:{fontSize:11,fontWeight:'600',color:'#087DEF',flexShrink:1},
});
