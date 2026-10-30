import type {ImageSourcePropType} from 'react-native';
const artwork:Record<string,{companion:ImageSourcePropType;coaching:ImageSourcePropType}>={
 peaceElite:{companion:require('../../../assets/catalog/peace-elite-duo.jpg'),coaching:require('../../../assets/catalog/peace-elite-coaching.jpg')},
 deltaForce:{companion:require('../../../assets/catalog/delta-force-duo.jpg'),coaching:require('../../../assets/catalog/delta-force-coaching.jpg')},
 honorOfKings:{companion:require('../../../assets/catalog/honor-of-kings-duo.jpg'),coaching:require('../../../assets/catalog/honor-of-kings-coaching.jpg')},
 valorant:{companion:require('../../../assets/catalog/valorant-duo.jpg'),coaching:require('../../../assets/catalog/valorant-coaching.jpg')},
};
export function catalogArtwork(game:string,serviceType:string='companion'){return artwork[game]?.[serviceType==='coaching'?'coaching':'companion'];}
