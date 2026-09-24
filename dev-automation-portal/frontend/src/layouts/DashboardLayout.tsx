import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';

import { useStore } from '../store/useStore';
import { getTheme } from '../theme/theme';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import CommandPalette from '../components/CommandPalette';
import ToastNotifications from '../components/ToastNotifications';
import { motion, AnimatePresence } from 'framer-motion';

const DRAWER_WIDTH = 260;

export const DashboardLayout: React.FC = () => {
  const { themeMode } = useStore();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleOpenCommandPalette = () => {
    setCommandPaletteOpen(true);
  };

  const handleCloseCommandPalette = () => {
    setCommandPaletteOpen(false);
  };

  // Keyboard shortcut listener for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeTheme = getTheme(themeMode);

  return (
    <ThemeProvider theme={activeTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* Sidebar Navigation */}
        <Sidebar mobileOpen={mobileOpen} onDrawerToggle={handleDrawerToggle} />

        {/* Main Content Area */}
        <Box
          sx={{
            flexGrow: 1,
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
          }}
        >
          {/* Topbar */}
          <Topbar
            onDrawerToggle={handleDrawerToggle}
            onOpenCommandPalette={handleOpenCommandPalette}
          />

          {/* Page Routing Outlet with smooth Framer Motion slide-in */}
          <Box component="main" sx={{ flexGrow: 1, py: 4, px: { xs: 2, sm: 3, md: 4 } }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                style={{ height: '100%' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>
      </Box>

      {/* Cmd+K Command Palette */}
      <CommandPalette open={commandPaletteOpen} onClose={handleCloseCommandPalette} />

      {/* Toast popups for the latest execution result (success/error) */}
      <ToastNotifications />
    </ThemeProvider>
  );
};

export default DashboardLayout;
