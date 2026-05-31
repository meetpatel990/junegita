// Bhagavad Gita Knowledge Base
// A collection of key verses and wisdom for Krishna to share

export interface GitaVerse {
  chapter: number;
  verse: number;
  text: string;
  meaning: string;
  topic: string;
}

export const gitaVerses: GitaVerse[] = [
  {
    chapter: 2,
    verse: 47,
    text: "You have a right to perform your prescribed duty, but you are not entitled to the fruits of action.",
    meaning: "Focus on your duty without worrying about the results. This is the key to liberation.",
    topic: "duty"
  },
  {
    chapter: 2,
    verse: 48,
    text: "Perform your obligatory duty, because action is indeed better than inaction.",
    meaning: "Taking action is always better than remaining idle. Do your work with dedication.",
    topic: "action"
  },
  {
    chapter: 3,
    verse: 27,
    text: "All works are being performed by the modes of material nature. The spirit soul accomplishes nothing.",
    meaning: "Recognize that actions are driven by nature, and your true self is beyond action.",
    topic: "nature"
  },
  {
    chapter: 5,
    verse: 24,
    text: "A person is said to have achieved yoga, the union with the Self, when having renounced all material desires, he neither acts for the gratification of the senses, nor engages in fruitive activities.",
    meaning: "True peace comes when you transcend material desires and act without attachment to results.",
    topic: "yoga"
  },
  {
    chapter: 6,
    verse: 5,
    text: "Lift yourself by your own mind; do not degrade yourself. For the mind can be the friend and enemy of the self.",
    meaning: "Your mind is your greatest tool. Use it wisely to elevate yourself.",
    topic: "mind"
  },
  {
    chapter: 2,
    verse: 14,
    text: "The non-permanent appearance of heat and cold, happiness and distress, and their disappearance in due course, are like the appearance and disappearance of winter and summer seasons.",
    meaning: "All experiences are temporary. Accept them without attachment.",
    topic: "impermanence"
  },
  {
    chapter: 4,
    verse: 9,
    text: "One who knows the transcendental nature of My appearance, dissolution, and activities does not, upon leaving the body, take birth again in this material world, but attains My eternal abode, O Arjuna.",
    meaning: "Understanding the divine nature leads to liberation from the cycle of rebirth.",
    topic: "liberation"
  },
  {
    chapter: 12,
    verse: 6,
    text: "But those who worship Me with all their thoughts, and who are always engaged in My service, worshiping Me with all their hearts, are very quickly brought to Me.",
    meaning: "Complete dedication and devotion lead to the divine.",
    topic: "devotion"
  },
  {
    chapter: 2,
    verse: 70,
    text: "A person is said to be in self-realization, in Brahman, when, like the ocean, he is unmoved by the incessant flow of desire and joy flowing into him from all sides.",
    meaning: "True wisdom is remaining unmoved by both pleasure and pain.",
    topic: "equanimity"
  },
  {
    chapter: 3,
    verse: 35,
    text: "It is far better to perform one's own prescribed duties imperfectly than to perform another's duties perfectly.",
    meaning: "Stay true to your own path. Don't compare yourself to others.",
    topic: "dharma"
  },
  {
    chapter: 8,
    verse: 7,
    text: "Therefore, Arjuna, in all circumstances, remember Me and fight. With your mind and intelligence fixed on Me, you will attain Me without doubt.",
    meaning: "Keep your focus on the divine in all you do. This brings certainty of spiritual progress.",
    topic: "focus"
  },
  {
    chapter: 15,
    verse: 15,
    text: "I am seated in everyone's heart, and from Me come all knowledge, remembrance, and forgetfulness.",
    meaning: "The divine resides within all beings. Look within yourself.",
    topic: "divinity"
  },
  {
    chapter: 2,
    verse: 56,
    text: "One who is not disturbed in mind even amidst the threefold miseries or elated when there is happiness, and who has a steady mind in both the material and spiritual consciousness, is certainly a sage of the highest order.",
    meaning: "True wisdom is maintaining equanimity through all of life's changes.",
    topic: "wisdom"
  },
  {
    chapter: 4,
    verse: 37,
    text: "As a fire is covered by smoke, as a mirror is covered by dust, or as an embryo is covered by the womb, the living entity is similarly covered by different degrees of this lust.",
    meaning: "Ignorance clouds our true nature, but it can be cleared through knowledge and practice.",
    topic: "knowledge"
  },
  {
    chapter: 13,
    verse: 8,
    text: "Humility, unpretentiousness, non-violence, patience, honesty, service to the spiritual master, purity, steadiness, and self-control are considered knowledge.",
    meaning: "True knowledge includes cultivating virtues and spiritual discipline.",
    topic: "knowledge"
  }
];

// Find verses by topic or keywords
export function findRelevantVerses(query: string): GitaVerse[] {
  const lowerQuery = query.toLowerCase();
  return gitaVerses.filter(verse => 
    verse.topic.includes(lowerQuery) ||
    verse.text.toLowerCase().includes(lowerQuery) ||
    verse.meaning.toLowerCase().includes(lowerQuery)
  );
}

// Get a random verse for inspiration
export function getRandomVerse(): GitaVerse {
  return gitaVerses[Math.floor(Math.random() * gitaVerses.length)];
}

// Generate Krishna's response based on the query
export function generateKrishnaResponse(userQuery: string): string {
  const relevantVerses = findRelevantVerses(userQuery);
  
  if (relevantVerses.length === 0) {
    return `Dear Arjuna, your question touches on matters that I have reflected upon in the Gita. While I do not have a specific verse for this particular inquiry, remember this truth: All knowledge flows from understanding the nature of duty, action, and the eternal self. Meditate on the principles of dharma, and your answer shall become clear. ${getRandomVerse().text}`;
  }

  const verse = relevantVerses[0];
  return `Dear Arjuna, listen to my wisdom from Chapter ${verse.chapter}, Verse ${verse.verse}: "${verse.text}" \n\nThe meaning of this teaching is: ${verse.meaning}\n\nReflect upon these words, and let them guide your actions.`;
}
