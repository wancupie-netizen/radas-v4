import './workspace-greeting.css';
export function accountDisplayName(value: unknown): string {
 if(typeof value!=='string') return '';
 const name=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return name.length<=80 ? name : '';
}
export function WorkspaceGreeting({name,affiliate=false,id,onFindProducts}:{name?:string;affiliate?:boolean;id?:string;onFindProducts?:()=>void}) {
 const displayName=accountDisplayName(name);
 return <div className="workspace-greeting">
  <p className="workspace-greeting-hello">Hai{displayName?`, ${displayName}`:''} <span aria-hidden="true">👋</span></p>
  <h1 id={id}>{affiliate?'Nak cari produk untuk content seterusnya?':'Hari ini nak cipta video apa?'}</h1>
  <p className="workspace-greeting-description">{affiliate?'Semak cadangan produk, harga dan anggaran komisen sebelum mula cipta video.':'Ada idea? Tulis di bawah dan jadikannya video.'}</p>
  {onFindProducts&&<button type="button" className="workspace-greeting-link" onClick={onFindProducts}>Belum ada idea? Cari produk untuk video affiliate <span aria-hidden="true">→</span></button>}
 </div>;
}
