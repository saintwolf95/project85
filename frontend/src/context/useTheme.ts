import { useContext } from 'react';
import { ThemeContext } from './theme-context';


export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme debe utilizarse dentro de ThemeProvider');
  return context;
}
