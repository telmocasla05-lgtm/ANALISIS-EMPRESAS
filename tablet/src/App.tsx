// App de tablet/móvil (Fase C): mismo flujo de fichaje que el desktop
// (empleado → PIN → ON), pero con selección activa de categoría en vez de
// tracking pasivo (inviable en iOS/Android sin MDM, ver especificación §3).
import { useMemo, useState } from 'react';
import { ApiClient } from '@digital-power/shared';
import type { EmpleadoListItem, PinLoginResponse } from '@digital-power/shared';
import { clearConfig, loadConfig } from './lib/config';
import type { TabletConfig } from './lib/config';
import { recoverPending } from './lib/pending-store';
import EmployeeSelectScreen from './screens/EmployeeSelectScreen';
import PinScreen from './screens/PinScreen';
import ReadyScreen from './screens/ReadyScreen';
import SessionScreen from './screens/SessionScreen';
import SetupScreen from './screens/SetupScreen';

interface AuthState {
  token: string;
  employee: PinLoginResponse['employee'];
}

type Screen =
  | { name: 'setup' }
  | { name: 'employees'; notice: string | null }
  | { name: 'pin'; employee: EmpleadoListItem }
  | { name: 'ready'; auth: AuthState }
  | { name: 'session'; auth: AuthState; sessionId: string; resumed: boolean };

export default function App() {
  const [config, setConfig] = useState<TabletConfig | null>(() => loadConfig());
  const [screen, setScreen] = useState<Screen>(() =>
    loadConfig() ? { name: 'employees', notice: null } : { name: 'setup' },
  );

  const api = useMemo(() => new ApiClient(config?.serverUrl ?? ''), [config?.serverUrl]);

  if (!config || screen.name === 'setup') {
    return (
      <SetupScreen
        initial={config}
        onDone={(saved) => {
          setConfig(saved);
          setScreen({ name: 'employees', notice: null });
        }}
      />
    );
  }

  switch (screen.name) {
    case 'employees':
      return (
        <EmployeeSelectScreen
          api={api}
          slug={config.slug}
          notice={screen.notice}
          onSelect={(employee) => setScreen({ name: 'pin', employee })}
          onReconfigure={() => {
            clearConfig();
            setScreen({ name: 'setup' });
          }}
        />
      );
    case 'pin':
      return (
        <PinScreen
          api={api}
          employee={screen.employee}
          onBack={() => setScreen({ name: 'employees', notice: null })}
          onSuccess={(login) => {
            // Turnos anteriores con registros sin subir (p. ej. OFF sin red):
            // se recuperan en segundo plano, como hace el desktop.
            void recoverPending(api, login.token, login.employee.id);
            setScreen({ name: 'ready', auth: { token: login.token, employee: login.employee } });
          }}
        />
      );
    case 'ready':
      return (
        <ReadyScreen
          api={api}
          token={screen.auth.token}
          employee={screen.auth.employee}
          onBack={() => setScreen({ name: 'employees', notice: null })}
          onSession={(sessionId, { resumed }) =>
            setScreen({ name: 'session', auth: screen.auth, sessionId, resumed })
          }
        />
      );
    case 'session':
      return (
        <SessionScreen
          api={api}
          token={screen.auth.token}
          employee={screen.auth.employee}
          sessionId={screen.sessionId}
          resumed={screen.resumed}
          onClosed={() =>
            // Ordenador/tablet compartido: tras el OFF se vuelve a la lista
            setScreen({ name: 'employees', notice: 'Turno cerrado. ¡Hasta la próxima!' })
          }
        />
      );
  }
}
