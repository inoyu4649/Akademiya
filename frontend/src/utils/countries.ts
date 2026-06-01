export interface Country {
  code: string;
  ko: string;
  en: string;
}

export const COUNTRIES: Country[] = [
  { code: "KR", ko: "대한민국", en: "South Korea" },
  { code: "US", ko: "미국", en: "United States" },
  { code: "JP", ko: "일본", en: "Japan" },
  { code: "CN", ko: "중국", en: "China" },
  { code: "GB", ko: "영국", en: "United Kingdom" },
  { code: "DE", ko: "독일", en: "Germany" },
  { code: "FR", ko: "프랑스", en: "France" },
  { code: "CA", ko: "캐나다", en: "Canada" },
  { code: "AU", ko: "호주", en: "Australia" },
  { code: "IN", ko: "인도", en: "India" },
  { code: "BR", ko: "브라질", en: "Brazil" },
  { code: "MX", ko: "멕시코", en: "Mexico" },
  { code: "RU", ko: "러시아", en: "Russia" },
  { code: "IT", ko: "이탈리아", en: "Italy" },
  { code: "ES", ko: "스페인", en: "Spain" },
  { code: "NL", ko: "네덜란드", en: "Netherlands" },
  { code: "SE", ko: "스웨덴", en: "Sweden" },
  { code: "NO", ko: "노르웨이", en: "Norway" },
  { code: "DK", ko: "덴마크", en: "Denmark" },
  { code: "FI", ko: "핀란드", en: "Finland" },
  { code: "CH", ko: "스위스", en: "Switzerland" },
  { code: "AT", ko: "오스트리아", en: "Austria" },
  { code: "BE", ko: "벨기에", en: "Belgium" },
  { code: "PL", ko: "폴란드", en: "Poland" },
  { code: "CZ", ko: "체코", en: "Czech Republic" },
  { code: "HU", ko: "헝가리", en: "Hungary" },
  { code: "PT", ko: "포르투갈", en: "Portugal" },
  { code: "GR", ko: "그리스", en: "Greece" },
  { code: "TR", ko: "터키", en: "Turkey" },
  { code: "SA", ko: "사우디아라비아", en: "Saudi Arabia" },
  { code: "AE", ko: "아랍에미리트", en: "United Arab Emirates" },
  { code: "IL", ko: "이스라엘", en: "Israel" },
  { code: "SG", ko: "싱가포르", en: "Singapore" },
  { code: "MY", ko: "말레이시아", en: "Malaysia" },
  { code: "TH", ko: "태국", en: "Thailand" },
  { code: "VN", ko: "베트남", en: "Vietnam" },
  { code: "PH", ko: "필리핀", en: "Philippines" },
  { code: "ID", ko: "인도네시아", en: "Indonesia" },
  { code: "NZ", ko: "뉴질랜드", en: "New Zealand" },
  { code: "ZA", ko: "남아프리카공화국", en: "South Africa" },
  { code: "NG", ko: "나이지리아", en: "Nigeria" },
  { code: "EG", ko: "이집트", en: "Egypt" },
  { code: "AR", ko: "아르헨티나", en: "Argentina" },
  { code: "CL", ko: "칠레", en: "Chile" },
  { code: "CO", ko: "콜롬비아", en: "Colombia" },
  { code: "TW", ko: "대만", en: "Taiwan" },
  { code: "HK", ko: "홍콩", en: "Hong Kong" },
];

type DisplayLang = "ko" | "en" | "ja" | "zh";

export function getCountryName(code: string, lang: DisplayLang): string {
  const c = COUNTRIES.find((c) => c.code === code);
  if (!c) return code;
  return lang === "ko" ? c.ko : c.en;
}

export function sortedCountries(lang: DisplayLang): Country[] {
  return [...COUNTRIES].sort((a, b) => {
    const na = lang === "ko" ? a.ko : a.en;
    const nb = lang === "ko" ? b.ko : b.en;
    return na.localeCompare(nb, lang === "ko" ? "ko" : "en");
  });
}
