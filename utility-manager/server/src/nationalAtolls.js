// The Maldives' 20 administrative atolls, north to south, for the national
// takeover tracker (routes/takeover.js). SCRD's own atolls are also in the
// atolls table; the codes match.
export const NATIONAL_ATOLLS = [
  ['HA', 'Haa Alif'], ['HDh', 'Haa Dhaalu'], ['Sh', 'Shaviyani'], ['N', 'Noonu'], ['R', 'Raa'], ['B', 'Baa'],
  ['Lh', 'Lhaviyani'], ['K', 'Kaafu'], ['AA', 'Alif Alif'], ['ADh', 'Alif Dhaalu'], ['V', 'Vaavu'], ['M', 'Meemu'],
  ['F', 'Faafu'], ['Dh', 'Dhaalu'], ['Th', 'Thaa'], ['L', 'Laamu'], ['GA', 'Gaafu Alif'], ['GDh', 'Gaafu Dhaalu'],
  ['Gn', 'Gnaviyani'], ['S', 'Seenu'],
].map(([code, name], order) => ({ code, name, order }));

// Inhabited islands the takeover counts: the census's 187 less R. Dhuvaafaru
// and ADh. Maamigili, run by other operators (migration 064).
export const INHABITED_ISLANDS = 185;
