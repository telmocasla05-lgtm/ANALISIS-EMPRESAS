interface Props {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function PinPad({ onDigit, onDelete, disabled = false }: Props) {
  return (
    <div className="pin-pad">
      {KEYS.map((key, index) =>
        key === '' ? (
          <span key={index} />
        ) : (
          <button
            key={index}
            type="button"
            className="pin-key"
            disabled={disabled}
            onClick={() => (key === '⌫' ? onDelete() : onDigit(key))}
          >
            {key}
          </button>
        ),
      )}
    </div>
  );
}
