import React, { useEffect, useRef, useState } from 'react';
import { Snackbar, Alert, AlertTitle } from '@mui/material';
import { useStore, NotificationItem } from '../store/useStore';

export const ToastNotifications: React.FC = () => {
  const { notifications } = useStore();
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const [current, setCurrent] = useState<NotificationItem | null>(null);
  const [open, setOpen] = useState(false);
  const lastSeenId = useRef<string | null>(null);

  // Enqueue any notification newer than the last one we've already shown.
  useEffect(() => {
    const latest = notifications[0];
    if (latest && latest.id !== lastSeenId.current) {
      lastSeenId.current = latest.id;
      setQueue((prev) => [...prev, latest]);
    }
  }, [notifications]);

  // Drain the queue one toast at a time.
  useEffect(() => {
    if (queue.length > 0 && !current) {
      setCurrent(queue[0]);
      setQueue((prev) => prev.slice(1));
      setOpen(true);
    } else if (queue.length > 0 && current && open) {
      setOpen(false);
    }
  }, [queue, current, open]);

  const handleClose = (_event?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleExited = () => {
    setCurrent(null);
  };

  if (!current) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={current.type === 'error' ? 7000 : 4500}
      onClose={handleClose}
      TransitionProps={{ onExited: handleExited }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        onClose={handleClose}
        severity={current.type}
        variant="filled"
        sx={{ width: '100%', maxWidth: 420, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
      >
        <AlertTitle sx={{ fontWeight: 700 }}>{current.title}</AlertTitle>
        {current.message}
      </Alert>
    </Snackbar>
  );
};

export default ToastNotifications;
