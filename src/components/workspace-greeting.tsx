import './workspace-greeting.css';
export function accountDisplayName(value: unknown): string {
 if(typeof value!=='string') return '';
 const name=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return name.length<=80 ? name : '';
}
export function accountEmailName(value: unknown): string {
 if(typeof value!=='string' || value.length>254 || !/^[^@\s\u0000-\u001f\u007f]+@[^@\s\u0000-\u001f\u007f]+$/.test(value)) return '';
 return accountDisplayName(value.slice(0,value.indexOf('@')));
}
export function WorkspaceGreeting({name,email,affiliate=false,id,onFindProducts}:{name?:string;email?:string;affiliate?:boolean;id?:string;onFindProducts?:()=>void}) {
 const displayName=affiliate?accountDisplayName(name):accountEmailName(email);
 return <div className="workspace-greeting">
  <p className="workspace-greeting-hello">{affiliate?<>Hai{displayName?`, ${displayName}`:''} <span aria-hidden="true">👋</span></>:<>Hi{displayName?` ${displayName}`:''}</>}</p>
  <h1 id={id}>{affiliate?'Nak cari produk untuk content seterusnya?':'What video would you like to create today?'}</h1>
  <p className="workspace-greeting-description">{affiliate?'Semak cadangan produk, harga dan anggaran komisen sebelum mula cipta video.':'Have an idea? Describe it below and turn it into a video.'}</p>
  {onFindProducts&&<button type="button" className="workspace-greeting-link" onClick={onFindProducts}>Need inspiration? Find a product for your affiliate video <span aria-hidden="true">→</span></button>}
 </div>;
}
