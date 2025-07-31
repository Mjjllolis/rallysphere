import { Switch } from 'react-native';
import { useColorScheme } from 'react-native';

export const ThemeToggle = () => {
    const scheme = useColorScheme();
    return <Switch value={scheme === 'dark'} disabled />;
};