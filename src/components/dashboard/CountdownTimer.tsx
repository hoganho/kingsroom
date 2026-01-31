// src/components/dashboard/CountdownTimer.tsx
// Live countdown timer that updates every second

import React, { useState, useEffect, useMemo } from 'react';

interface CountdownTimerProps {
  targetDate: string;
  className?: string;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

const calculateTimeRemaining = (targetDate: string): TimeRemaining => {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { hours, minutes, seconds, isExpired: false };
};

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDate, className = '' }) => {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() => 
    calculateTimeRemaining(targetDate)
  );

  useEffect(() => {
    // Update immediately when targetDate changes
    setTimeRemaining(calculateTimeRemaining(targetDate));

    // Set up interval for updates
    const interval = setInterval(() => {
      const newTime = calculateTimeRemaining(targetDate);
      setTimeRemaining(newTime);
      
      // Clear interval if expired
      if (newTime.isExpired) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  const formattedTime = useMemo(() => {
    if (timeRemaining.isExpired) {
      return 'Starting now';
    }

    const { hours, minutes, seconds } = timeRemaining;
    
    // Format with leading zeros
    const pad = (num: number) => num.toString().padStart(2, '0');
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    
    if (hours > 0) {
      return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    }
    
    if (minutes > 0) {
      return `${minutes}m ${pad(seconds)}s`;
    }
    
    return `${seconds}s`;
  }, [timeRemaining]);

  // Determine urgency color
  const urgencyClass = useMemo(() => {
    if (timeRemaining.isExpired) {
      return 'text-green-600 dark:text-green-400';
    }
    
    const totalMinutes = timeRemaining.hours * 60 + timeRemaining.minutes;
    
    if (totalMinutes <= 15) {
      return 'text-red-600 dark:text-red-400 font-semibold';
    }
    
    if (totalMinutes <= 60) {
      return 'text-orange-600 dark:text-orange-400 font-medium';
    }
    
    return 'text-gray-900 dark:text-gray-100 font-medium';
  }, [timeRemaining]);

  return (
    <span className={`${urgencyClass} ${className} tabular-nums`}>
      {formattedTime}
    </span>
  );
};
