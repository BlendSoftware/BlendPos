import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

import { posTheme } from './theme';
import App from './App';
import './index.css';
import './pwa';
// El catálogo se sincroniza al montar el PosTerminal (solo cuando el usuario ya está autenticado).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={posTheme} forceColorScheme="dark">
      <ModalsProvider>
        <Notifications position="top-right" zIndex={1000} />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>
);
