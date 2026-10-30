import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

const mobileRoot = path.resolve(process.cwd());
const componentSource = readFileSync(path.join(mobileRoot, "src/components/tab-icons.tsx"), "utf8");
const favoriteButtonSource = readFileSync(path.join(mobileRoot, "src/features/favorites/favorite-button.tsx"), "utf8");
const fileImageSource = readFileSync(path.join(mobileRoot, "src/components/file-image.tsx"), "utf8");
const safeImageSource = readFileSync(path.join(mobileRoot, "src/components/safe-image.tsx"), "utf8");
const iconImports = [...componentSource.matchAll(/import (\w+) from "\.\.\/\.\.\/(assets\/[^"\n]+\.png)";/gu)];
// Inspect actual rendered assets, not an obsolete directory name or only an RGBA header.
function hasVisibleTransparency(file: Buffer) {
  const width=file.readUInt32BE(16),height=file.readUInt32BE(20),stride=width*4,chunks: Buffer[]=[];
  for(let offset=8;offset<file.length;){const length=file.readUInt32BE(offset),kind=file.subarray(offset+4,offset+8).toString("ascii");if(kind==="IDAT")chunks.push(file.subarray(offset+8,offset+8+length));offset+=length+12;}
  const raw=inflateSync(Buffer.concat(chunks));assert.equal(raw.length,(stride+1)*height);
  let previous=Buffer.alloc(stride),transparent=false,visible=false;
  const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const offset=y*(stride+1),filter=raw.readUInt8(offset),row=Buffer.alloc(stride);
    assert.ok(filter<=4);
    for(let x=0;x<stride;x++){const left=x>=4?row.readUInt8(x-4):0,up=previous.readUInt8(x),upperLeft=x>=4?previous.readUInt8(x-4):0;row[x]=(raw.readUInt8(offset+1+x)+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft)))&255;}
    for(let x=3;x<stride;x+=4){transparent ||= row.readUInt8(x)<255;visible ||= row.readUInt8(x)>0;}
    previous=row;
  }
  return transparent&&visible;
}

test("设计图标全部使用真正带 Alpha 的透明 PNG，不再使用白底原图", () => {
  const mapping = componentSource.match(/const iconSources = \{([\s\S]*?)\} as const;/u)?.[1];
  assert.ok(mapping, "正式图标映射必须存在");
  const importedNames = new Set(iconImports.map(([, name]) => name));
  // Several semantic roles may share one source; validate every role instead of counting duplicate imports.
  for (const role of ["home", "order", "message", "mine", "service", "wallet", "shield", "setting", "favorite", "coupon", "withdraw", "favoriteActionOutline", "favoriteActionFilled", "messageAction"]) {
    const name = mapping.match(new RegExp(`\\b${role}: (\\w+)`))?.[1];
    assert.ok(name && importedNames.has(name), `${role} 必须绑定实际导入的本地图片`);
  }
  for (const [,name,relativePath] of iconImports) {
    assert.ok(relativePath, "图标导入路径必须存在");
    const file = readFileSync(path.join(mobileRoot, relativePath));
    assert.equal(file.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(file[25], 6, `${name}.png 必须是 RGBA PNG`);
    assert.equal(file[24],8,`${name} 必须是8位RGBA PNG`);
    assert.ok(hasVisibleTransparency(file),`${name} 不能只有白底或全透明像素`);
  }

  assert.doesNotMatch(componentSource, /assets\/icon-(?:home|order|message|mine|service|wallet|shield|setting)\.png/u);
  assert.doesNotMatch(componentSource, /backgroundColor:\s*["']#FFFFFF["']/u);
});

test("收藏前后使用设计稿同源轮廓、实心状态和 200ms 回弹动画", () => {
  assert.match(componentSource, /favoriteActionFilled/u);
  assert.match(componentSource, /favoriteActionOutline/u);
  assert.match(componentSource, /scale\.setValue\(0\.82\)/u);
  assert.match(componentSource, /toValue: 1\.08, duration: 140/u);
  assert.match(componentSource, /toValue: 1, duration: 60/u);
  assert.match(componentSource, /source=\{selected \? iconSources\.favoriteActionFilled : iconSources\.favoriteActionOutline\}/u);
  const filled=iconImports.find(([,name])=>name==="favoriteActionFilledIcon"),outline=iconImports.find(([,name])=>name==="favoriteActionOutlineIcon");
  assert.ok(filled&&outline);assert.notEqual(filled[2],outline[2],"收藏前后必须使用不同的设计状态图");
  assert.match(favoriteButtonSource, /<Text style=\{styles\.companionLabel\}>收藏陪玩<\/Text>/u);
  assert.match(favoriteButtonSource, /<Text style=\{styles\.serviceLabel\}>收藏服务<\/Text>/u);
  assert.doesNotMatch(favoriteButtonSource, /active \? "已收藏" : "收藏陪玩"/u);
});

test("真实文件缺失或加载失败时如实显示占位，不用默认图掩盖", () => {
  assert.doesNotMatch(fileImageSource, /fallbackSource/u);
  assert.doesNotMatch(safeImageSource, /fallbackSource/u);
  assert.match(fileImageSource, /图片暂不可用/u);
  assert.match(safeImageSource, /onError=\{\(\) => setFailed\(true\)\}/u);
});
