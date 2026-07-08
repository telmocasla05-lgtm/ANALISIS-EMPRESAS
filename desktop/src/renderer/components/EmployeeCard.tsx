import type { EmpleadoListItem } from '@digital-power/shared';

interface Props {
  employee: EmpleadoListItem;
  onSelect: (employee: EmpleadoListItem) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts[1]?.charAt(0) ?? '';
  return (first + second).toUpperCase();
}

export default function EmployeeCard({ employee, onSelect }: Props) {
  return (
    <button type="button" className="employee-card" onClick={() => onSelect(employee)}>
      {employee.avatarUrl ? (
        <img className="employee-avatar" src={employee.avatarUrl} alt="" />
      ) : (
        <span className="employee-avatar employee-avatar-initials" aria-hidden="true">
          {initials(employee.name)}
        </span>
      )}
      <span className="employee-name">{employee.name}</span>
    </button>
  );
}
