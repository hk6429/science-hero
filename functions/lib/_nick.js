export const NICK_ADJ = ['好奇的','冷靜的','閃亮的','勇敢的','機智的','沉穩的','敏銳的','熱血的'];
export const NICK_NOUN = ['電子','磁鐵','火山','彗星','葉綠體','光子','恐龍','石英','水分子','貓頭鷹'];

export function isValidNick(nick) {
  if (typeof nick !== 'string') return false;
  return NICK_ADJ.some((adj) => NICK_NOUN.some((noun) => new RegExp(`^${adj}${noun}\\d{0,2}$`, 'u').test(nick)));
}
