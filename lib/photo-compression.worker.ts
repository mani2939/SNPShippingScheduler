import encode, {init} from "@jsquash/webp/encode.js";
import { imageSize, photoTargetBytes, type CompressionResult } from "./photo-compression-settings";
// Squoosh-derived codec, served with the app. No images go to a third party.
self.onmessage = async ({data:file}:{data:File}) => {
  let image:ImageBitmap|undefined;
  try {
    image=await createImageBitmap(file);
    if(image.width*image.height>48_000_000)throw Error("Choose a photo up to 48 megapixels or resize it in Squoosh first.");
    await init({locateFile:(path:string)=>`${self.location.origin}/codecs/${path}`});
    let best:CompressionResult|undefined;
    for(const maxEdge of [1600,1200,900,650,480]) {
      const {width,height}=imageSize(image.width,image.height,maxEdge);
      const canvas=new OffscreenCanvas(width,height);
      const context=canvas.getContext("2d");
      if(!context)throw Error("Image compression is unavailable in this browser. Use Squoosh first.");
      context.drawImage(image,0,0,width,height);
      const pixels=context.getImageData(0,0,width,height);
      for(const quality of [65,50,35]) {
        const bytes=await encode(pixels,{quality,method:6,pass:6,alpha_quality:65});
        best={bytes,type:"image/webp",name:file.name.replace(/\.[^.]*$/,"")+".webp",originalBytes:file.size,width,height};
        if(bytes.byteLength<=photoTargetBytes)break;
      }
      if(best && best.bytes.byteLength<=photoTargetBytes)break;
    }
    if(!best || best.bytes.byteLength>photoTargetBytes)throw Error("Could not reduce this photo to 200 KB. Resize it in Squoosh and try again.");
    // Keep an already small original when re-encoding would increase its size.
    if(file.size<best.bytes.byteLength){best={...best,bytes:await file.arrayBuffer(),type:file.type,name:file.name,width:image.width,height:image.height};}
    self.postMessage({result:best},{transfer:[best.bytes]});
  }catch(e){self.postMessage({error:e instanceof Error?e.message:"Could not compress photo."});}
  finally{image?.close();}
};
