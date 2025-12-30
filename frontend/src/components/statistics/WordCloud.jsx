import React from 'react';

// Color palette for words
const COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
];

const WordCloud = ({ words, maxWords = 40 }) => {
  if (!words || words.length === 0) {
    return (
      <div className="word-cloud-empty">
        <p>No words to display yet</p>
      </div>
    );
  }

  // Take top N words
  const topWords = words.slice(0, maxWords);

  // Find min and max counts for scaling
  const counts = topWords.map(w => w.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = maxCount - minCount || 1;

  // Calculate font sizes (scale from 0.75rem to 2.5rem)
  const minSize = 0.75;
  const maxSize = 2.5;

  const processedWords = topWords.map((word, index) => {
    const normalized = (word.count - minCount) / range;
    const eased = Math.pow(normalized, 0.5);
    const fontSize = minSize + (eased * (maxSize - minSize));
    const color = COLORS[index % COLORS.length];

    return {
      ...word,
      fontSize,
      color,
    };
  });

  return (
    <div className="word-cloud">
      {processedWords.map((word) => (
        <span
          key={word.word}
          className="word-cloud-word"
          style={{
            fontSize: `${word.fontSize}rem`,
            color: word.color,
          }}
          title={`"${word.word}" - used ${word.count} times`}
        >
          {word.word}
        </span>
      ))}
    </div>
  );
};

export default WordCloud;
