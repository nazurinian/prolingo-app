import React from 'react';

export const HighlightedText = ({ text, highlight, className = "" }) => {
  if (!highlight || !text) return <span className={className}>{text}</span>;
  
  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));
  return (
    <span className={className}>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <strong key={i} className="font-extrabold text-current underline decoration-dotted decoration-2 underline-offset-2">{part}</strong>
        ) : (
          part
        )
      )}
    </span>
  );
};

export default HighlightedText;
