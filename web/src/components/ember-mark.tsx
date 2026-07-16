export function EmberMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M16 2.5c1.4 5.4-1.6 7.7-4.2 10.7-2 2.3-3.4 4.5-3.4 7.3 0 4.6 3.3 8.5 8 8.5 4.5 0 7.8-3.6 7.8-8 0-4.7-3-8.4-8.2-18.5Z"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="M16.3 14c.3 2.6-3 4.1-3 7.2 0 1.9 1.3 3.5 3.3 3.5s3.4-1.5 3.4-3.6c0-2.2-1.4-4.2-3.7-7.1Z"
        fill="currentColor"
      />
    </svg>
  );
}
