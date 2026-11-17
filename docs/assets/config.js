// Konfigurasi publik Supabase. Kunci "publishable" memang dirancang terlihat di browser;
// data dilindungi aturan akses (RLS) + login, bukan oleh kerahasiaan kunci ini.
window.DASH_CONFIG = {
  url: 'https://frgioczyzvzdaqdkuafs.supabase.co',
  key: 'sb_publishable_-RIoKPN80pe0kJyjXoHC0A_rWaIwuvt',
  // Login memakai NAMA PENGGUNA. Supabase mewajibkan email, jadi "budi" dikirim sebagai "budi@dashte.invalid".
  // Domain .invalid dicadangkan untuk keperluan tiruan: tidak ada email yang pernah terkirim.
  userDomain: 'dashte.invalid',
};
