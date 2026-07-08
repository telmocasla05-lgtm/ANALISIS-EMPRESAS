interface Props {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function PinPad({ onDigit, onDelete, disabled }: Props) {
  return (
    <div className="pin-pad">
      {DIGITS.map((digit) => (
        <button
          key={digit}
          type="button"
          className="pin-key"
          onClick={() => onDigit(digit)}
          disabled={disabled}
        >
          {digit}
        </button>
      ))}
      <span aria-hidden="true" />
      <button type="button" className="pin-key" onClick={() => onDigit('0')} disabled={disabled}>
        0
      </button>
      <button
        type="button"
        className="pin-key pin-key-delete"
        onClick={onDelete}
        disabled={disabled}
        aria-label="Borrar"
      >
        ⌫
      </button>
    </div>
  );
}
