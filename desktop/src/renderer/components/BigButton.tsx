import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'on' | 'off';
  disabled?: boolean;
}

export default function BigButton({ children, onClick, variant = 'primary', disabled }: Props) {
  return (
    <button
      type="button"
      className={`big-button big-button-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
