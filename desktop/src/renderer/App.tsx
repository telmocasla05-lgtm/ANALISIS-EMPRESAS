import { useEffect, useState } from 'react';
import type { EmpleadoListItem } from '@digital-power/shared';
import type { SessionEmployee } from '../common/ipc-contract';
import SetupScreen from './screens/SetupScreen';
import EmployeeSelectScreen from './screens/EmployeeSelectScreen';
import PinScreen from './screens/PinScreen';
import SessionScreen from './screens/SessionScreen';

// Máquina de estados de pantallas: setup → employees → pin → session.
// Tras el OFF se vuelve siempre a employees (ordenadores compartidos).
type Screen =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'employees'; notice?: string }
  | { name: 'pin'; employee: EmpleadoListItem }
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
          onSuccess={(employee) => setScreen({ name: 'session', employee })}
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
