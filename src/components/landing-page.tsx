import { PACKAGES } from '@/lib/payments/packages';
import { PRODUCT } from '@/lib/config';

export function LandingPage() {
 return <div className="landing" id="top">
  <a className="landing-skip" href="#landing-main">Terus ke kandungan</a>
  <header className="landing-header landing-wrap">
   <a href="/" className="brand" aria-label="RADAS halaman utama"><span className="brand-mark" aria-hidden="true">R</span>RADAS<span className="brand-dot">.</span></a>
   <nav aria-label="Navigasi utama"><a href="#cara">Cara guna</a><a href="#pakej">Pakej</a><a href="/login" className="landing-login">Login <span aria-hidden="true">↗</span></a></nav>
  </header>
  <main id="landing-main">
   <section className="landing-hero landing-wrap" aria-labelledby="landing-title">
    <div className="landing-hero-copy"><p className="landing-eyebrow"><span aria-hidden="true"/> IDEA ANDA. VIDEO ANDA.</p>
     <h1 id="landing-title">Generate AI Video<br/><span>Serendah RM{PRODUCT.packagePriceMYR}.</span></h1>
     <p className="landing-lead">RM{PRODUCT.packagePriceMYR} untuk {PRODUCT.packageCredits} video AI. Top up bila perlu, generate dan download terus.</p>
     <div className="landing-actions"><a href="/register" className="primary">Mula Sekarang <span aria-hidden="true">↗</span></a><a href="/studio" className="landing-text-link">Buka Studio <span aria-hidden="true">→</span></a></div>
     <p className="landing-small">1 credit = 1 video · {PRODUCT.durationSeconds} saat setiap generation</p>
    </div>
    <aside className="landing-highlight" aria-label="Pakej permulaan Try">
     <div className="landing-card-top"><span className="landing-eyebrow">MULA DENGAN TRY</span><span className="landing-tag">TOP UP</span></div>
     <p className="landing-big-price"><span>RM</span>{PRODUCT.packagePriceMYR}</p><h2>{PRODUCT.packageCredits} video credits</h2>
     <p>Untuk idea yang mahu anda cuba.</p>
     <div className="landing-formats"><span>Teks → Video</span><span>Gambar → Video</span></div>
     <div className="landing-card-bottom"><span>{PRODUCT.durationSeconds} SAAT</span><span>720p / 1080p</span></div>
    </aside>
   </section>
   <div className="landing-specs" aria-label="Format video"><div className="landing-wrap"><span>Text &amp; Image to Video</span><span>Portrait 9:16</span><span>Landscape 16:9</span><span>720p &amp; 1080p</span></div></div>
   <section id="cara" className="landing-section landing-wrap" aria-labelledby="steps-title">
    <div className="landing-section-heading"><p className="landing-eyebrow">DARI IDEA KE VIDEO</p><h2 id="steps-title">Tiga langkah untuk bermula.</h2></div>
    <ol className="landing-steps">
     <li><span className="landing-step-number" aria-hidden="true">01</span><h3>Daftar atau login</h3><p>Buka akaun RADAS dan masuk ke studio anda.</p></li>
     <li><span className="landing-step-number" aria-hidden="true">02</span><h3>Top up credits</h3><p>Pilih pakej dan bayar melalui Maybank QR. Kredit masuk selepas admin mengesahkan bayaran.</p></li>
     <li><span className="landing-step-number" aria-hidden="true">03</span><h3>Generate &amp; download</h3><p>Tulis prompt atau pilih gambar, tetapkan format dan generate video {PRODUCT.durationSeconds} saat. Download apabila siap.</p></li>
    </ol>
   </section>
   <section id="pakej" className="landing-section landing-wrap" aria-labelledby="pricing-title">
    <div className="landing-section-heading"><p className="landing-eyebrow">PAKEJ CREDITS</p><h2 id="pricing-title">Top up ikut keperluan.</h2><p>Bayaran sekali untuk pakej pilihan anda. Tiada subscription.</p></div>
    <div className="landing-packages">{PACKAGES.map(pack=><article key={pack.id} className={`landing-package${pack.id==='try'?' landing-entry':''}`}>
     <div className="landing-package-heading"><h3>{pack.name}</h3>{pack.id==='try'?<span className="landing-tag">MULA DI SINI</span>:null}</div>
     <p className="landing-package-price">RM{pack.amountSen/100}</p><p className="landing-package-credits"><strong>{pack.credits}</strong> video credits</p>
     <p className="landing-package-note">1 credit untuk 1 generation</p><a href="/register" className={pack.id==='try'?'primary':'landing-package-cta'} aria-label={`Daftar untuk pakej ${pack.name}`}>Mula dengan {pack.name} <span aria-hidden="true">↗</span></a>
    </article>)}</div>
    <p className="landing-payment-note">Bayaran Maybank QR disahkan secara manual sebelum kredit masuk. Semak status pesanan di dalam studio.</p>
   </section>
   <section className="landing-section landing-wrap landing-faq" aria-labelledby="faq-title">
    <div className="landing-section-heading"><p className="landing-eyebrow">SEBELUM ANDA BERMULA</p><h2 id="faq-title">Perkara yang perlu tahu.</h2></div>
    <div><details><summary>Berapa lama video yang dihasilkan?</summary><p>Setiap generation menghasilkan video {PRODUCT.durationSeconds} saat. Anda boleh memilih portrait atau landscape serta resolusi 720p atau 1080p. Kedua-dua resolusi menggunakan 1 credit setiap generation.</p></details>
     <details><summary>Bila kredit top up masuk?</summary><p>Selepas anda menghantar rujukan transaksi dan admin mengesahkan wang diterima. Bayaran ini disemak secara manual.</p></details>
     <details><summary>Berapa lama video boleh didownload?</summary><p>Video disimpan sementara sehingga {PRODUCT.retentionHours} jam. Download terus apabila siap. Senarai video dalam sesi akan kosong selepas refresh atau logout.</p></details></div>
   </section>
   <section className="landing-wrap"><div className="landing-final"><div><p className="landing-eyebrow">ADA IDEA UNTUK VIDEO?</p><h2>Bawa idea anda ke studio.</h2></div><a href="/register" className="primary">Mula dengan RM{PRODUCT.packagePriceMYR} <span aria-hidden="true">↗</span></a></div></section>
  </main>
  <footer className="landing-footer landing-wrap"><a href="#top" className="brand">RADAS<span className="brand-dot">.</span></a><p>AI Video Generator · Top up, generate, download.</p><a href="/login">Login <span aria-hidden="true">↗</span></a></footer>
 </div>;
}
