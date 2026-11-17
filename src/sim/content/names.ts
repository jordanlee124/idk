// Syllable pools for the name generator. Each culture picks a few of each so peoples sound distinct.

export const ONSETS = ['k', 'v', 'r', 'sh', 'd', 'm', 'n', 't', 'l', 'z', 'b', 'h', 'th', 'g', 'y', 's', 'br', 'tr', 'kh', 'f', 'w', 'ch', 'p', 'j'];
export const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou', 'ei', 'au'];
export const CODAS = ['', '', '', 'n', 'r', 'l', 'k', 's', 'th', 'm', 'x', 'nd', 'rk'];

export const TRAITS = ['curious', 'hardy', 'fertile', 'warlike', 'devout', 'mercantile'] as const;
export const TRAIT_BLURB: Record<string, string> = {
  curious: 'Quicker to discover things',
  hardy: 'Fewer deaths',
  fertile: 'More births',
  warlike: 'Proud of their spears (matters from the next milestone)',
  devout: 'Keepers of old rites (matters from the next milestone)',
  mercantile: 'Eager to trade (matters from the next milestone)',
};
