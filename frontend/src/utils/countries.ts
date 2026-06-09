export interface Country {
  code: string;
  ko: string;
  en: string;
  ja: string;
  zh: string;
}

export const COUNTRIES: Country[] = [
  { code: "KR", ko: "대한민국",      en: "South Korea",              ja: "韓国",             zh: "韩国" },
  { code: "US", ko: "미국",          en: "United States",            ja: "アメリカ",         zh: "美国" },
  { code: "JP", ko: "일본",          en: "Japan",                    ja: "日本",             zh: "日本" },
  { code: "CN", ko: "중국",          en: "China",                    ja: "中国",             zh: "中国" },
  { code: "GB", ko: "영국",          en: "United Kingdom",           ja: "イギリス",         zh: "英国" },
  { code: "DE", ko: "독일",          en: "Germany",                  ja: "ドイツ",           zh: "德国" },
  { code: "FR", ko: "프랑스",        en: "France",                   ja: "フランス",         zh: "法国" },
  { code: "CA", ko: "캐나다",        en: "Canada",                   ja: "カナダ",           zh: "加拿大" },
  { code: "AU", ko: "호주",          en: "Australia",                ja: "オーストラリア",   zh: "澳大利亚" },
  { code: "IN", ko: "인도",          en: "India",                    ja: "インド",           zh: "印度" },
  { code: "BR", ko: "브라질",        en: "Brazil",                   ja: "ブラジル",         zh: "巴西" },
  { code: "MX", ko: "멕시코",        en: "Mexico",                   ja: "メキシコ",         zh: "墨西哥" },
  { code: "RU", ko: "러시아",        en: "Russia",                   ja: "ロシア",           zh: "俄罗斯" },
  { code: "IT", ko: "이탈리아",      en: "Italy",                    ja: "イタリア",         zh: "意大利" },
  { code: "ES", ko: "스페인",        en: "Spain",                    ja: "スペイン",         zh: "西班牙" },
  { code: "NL", ko: "네덜란드",      en: "Netherlands",              ja: "オランダ",         zh: "荷兰" },
  { code: "SE", ko: "스웨덴",        en: "Sweden",                   ja: "スウェーデン",     zh: "瑞典" },
  { code: "NO", ko: "노르웨이",      en: "Norway",                   ja: "ノルウェー",       zh: "挪威" },
  { code: "DK", ko: "덴마크",        en: "Denmark",                  ja: "デンマーク",       zh: "丹麦" },
  { code: "FI", ko: "핀란드",        en: "Finland",                  ja: "フィンランド",     zh: "芬兰" },
  { code: "CH", ko: "스위스",        en: "Switzerland",              ja: "スイス",           zh: "瑞士" },
  { code: "AT", ko: "오스트리아",    en: "Austria",                  ja: "オーストリア",     zh: "奥地利" },
  { code: "BE", ko: "벨기에",        en: "Belgium",                  ja: "ベルギー",         zh: "比利时" },
  { code: "PL", ko: "폴란드",        en: "Poland",                   ja: "ポーランド",       zh: "波兰" },
  { code: "CZ", ko: "체코",          en: "Czech Republic",           ja: "チェコ",           zh: "捷克" },
  { code: "HU", ko: "헝가리",        en: "Hungary",                  ja: "ハンガリー",       zh: "匈牙利" },
  { code: "PT", ko: "포르투갈",      en: "Portugal",                 ja: "ポルトガル",       zh: "葡萄牙" },
  { code: "GR", ko: "그리스",        en: "Greece",                   ja: "ギリシャ",         zh: "希腊" },
  { code: "TR", ko: "터키",          en: "Turkey",                   ja: "トルコ",           zh: "土耳其" },
  { code: "SA", ko: "사우디아라비아",en: "Saudi Arabia",             ja: "サウジアラビア",   zh: "沙特阿拉伯" },
  { code: "AE", ko: "아랍에미리트",  en: "United Arab Emirates",     ja: "アラブ首長国連邦", zh: "阿联酋" },
  { code: "IL", ko: "이스라엘",      en: "Israel",                   ja: "イスラエル",       zh: "以色列" },
  { code: "SG", ko: "싱가포르",      en: "Singapore",                ja: "シンガポール",     zh: "新加坡" },
  { code: "MY", ko: "말레이시아",    en: "Malaysia",                 ja: "マレーシア",       zh: "马来西亚" },
  { code: "TH", ko: "태국",          en: "Thailand",                 ja: "タイ",             zh: "泰国" },
  { code: "VN", ko: "베트남",        en: "Vietnam",                  ja: "ベトナム",         zh: "越南" },
  { code: "PH", ko: "필리핀",        en: "Philippines",              ja: "フィリピン",       zh: "菲律宾" },
  { code: "ID", ko: "인도네시아",    en: "Indonesia",                ja: "インドネシア",     zh: "印度尼西亚" },
  { code: "NZ", ko: "뉴질랜드",      en: "New Zealand",              ja: "ニュージーランド", zh: "新西兰" },
  { code: "ZA", ko: "남아프리카공화국", en: "South Africa",          ja: "南アフリカ",       zh: "南非" },
  { code: "NG", ko: "나이지리아",    en: "Nigeria",                  ja: "ナイジェリア",     zh: "尼日利亚" },
  { code: "EG", ko: "이집트",        en: "Egypt",                    ja: "エジプト",         zh: "埃及" },
  { code: "AR", ko: "아르헨티나",    en: "Argentina",                ja: "アルゼンチン",     zh: "阿根廷" },
  { code: "CL", ko: "칠레",          en: "Chile",                    ja: "チリ",             zh: "智利" },
  { code: "CO", ko: "콜롬비아",      en: "Colombia",                 ja: "コロンビア",       zh: "哥伦比亚" },
  { code: "TW", ko: "대만",          en: "Taiwan",                   ja: "台湾",             zh: "台湾" },
  { code: "HK", ko: "홍콩",          en: "Hong Kong",                ja: "香港",             zh: "香港" },
];

type DisplayLang = "ko" | "en" | "ja" | "zh";

function pickName(c: Country, lang: DisplayLang): string {
  if (lang === "ko") return c.ko;
  if (lang === "ja") return c.ja;
  if (lang === "zh") return c.zh;
  return c.en;
}

export function getCountryName(code: string, lang: DisplayLang): string {
  const c = COUNTRIES.find((c) => c.code === code);
  if (!c) return code;
  return pickName(c, lang);
}

export function sortedCountries(lang: DisplayLang): Country[] {
  const locale = lang === "ko" ? "ko" : lang === "ja" ? "ja" : lang === "zh" ? "zh" : "en";
  return [...COUNTRIES].sort((a, b) =>
    pickName(a, lang).localeCompare(pickName(b, lang), locale)
  );
}
