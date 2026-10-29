import {maxSourceBytes, type CompressionResult} from "./photo-compression-settings";
export async function compressPhoto(file: File): Promise<CompressionResult> {
  if(file.size > maxSourceBytes) throw Error(`${file.name}: choose an original photo up to 25 MB.`);
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)) throw Error("Choose JPEG, PNG or WebP photos.");
  const worker = new Worker(new URL("./photo-compression.worker.ts", import.meta.url),{type:"module"});
  return new Promise((resolve,reject)=>{
    const finish = () => {clearTimeout(timer);worker.terminate();};
    const timer = setTimeout(()=>{finish();reject(Error("Compression took too long. Try a smaller photo or use Squoosh first."));},120000);
    worker.onmessage = ({data}:{data:{result?:CompressionResult;error?:string}})=>{finish();if(data.result)resolve(data.result);else reject(Error(data.error || "Could not compress photo."));};
    worker.onerror = ()=>{finish();reject(Error("Could not compress this photo. Try compressing it in Squoosh first."));};
    worker.postMessage(file);
  });
}
