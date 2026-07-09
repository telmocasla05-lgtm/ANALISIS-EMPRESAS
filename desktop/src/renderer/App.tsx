import { useEffect, useState } from 'react';
import type { EmpleadoListItem } from '@digital-power/shared';
import type { SessionEmployee } from '../common/ipc-contract';
import SetupScreen from './screens/SetupScreen';
import EmployeeSelectScreen from './screens/EmployeeSelectScreen';
import PinScreen from './screens/PinScreen';
import PermissionsScreen from './screens/PermissionsScreen';
import SessionScreen from './screens/SessionScreen';

// Máquina de estados de pantallas: setup → employees → pin → (permissions) → session.
// La pantalla de permisos solo aparece en macOS cuando falta alguno.
// Tras el OFF se vuelve siempre a employees (ordenadores compartidos).
type Screen =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'employees'; notice?: string }
  | { name: 'pin'; employee: EmpleadoListItem }
  | { name: 'permissions'; employee: SessionEmployee }
  | { name: 'session'; employee: SessionEmployee };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });

  useEffect(() => {
    void window.dpApi.getConfig().then((result) => {
      if (result.ok && result.data) {
        setScreen({ name: 'employees' });
      } else {
        setScreen({ name: 'setup' });
      }
    });
  }, []);

  // Tras identificarse: si en macOS falta algún permiso del tracking, se pasa
  // por la pantalla guiada antes de poder abrir turno.
  const goToSession = async (employee: SessionEmployee) => {
    const permissions = await window.dpApi.getPermissions();
    const missing =
      permissions.ok &&
      permissions.data.required &&
      (!permissions.data.accessibility || !permissions.data.screenRecording);
    setScreen(missing ? { name: 'permissions', employee } : { name: 'session', employee });
  };

  const backToEmployees = async (notice?: string) => {
    await window.dpApi.sesionCancel();
    setScreen({ name: 'employees', notice });
  };

  switch (screen.name) {
    case 'loading':
      return <div className="screen screen-center muted">Cargando…</div>;
    case 'setup':
      return <SetupScreen onSaved={() => setScreen({ name: 'employees' })} />;
    case 'employees':
      return (
        <EmployeeSelectScreen
          notice={screen.notice}
          onSelect={(employee) => setScreen({ name: 'pin', employee })}
          onOpenSetup={() => setScreen({ name: 'setup' })}
        />
      );
    case 'pin':
      return (
        <PinScreen
          employee={screen.employee}
          onBack={() => setScreen({ name: 'employees' })}
          onSuccess={(employee) => void goToSession(employee)}
        />
      );
    case 'permissions':
      return (
        <PermissionsScreen
          onContinue={() => setScreen({ name: 'session', employee: screen.employee })}
          onBack={() => void backToEmployees()}
        />
      );
    case 'session':
      return (
        <SessionScreen
          employee={screen.employee}
          onFinished={(notice) => setScreen({ name: 'employees', notice })}
        />
      );
  }
}
