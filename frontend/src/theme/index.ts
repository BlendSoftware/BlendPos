import { createTheme, type MantineColorsTuple } from '@mantine/core';

const posGreen: MantineColorsTuple = [
    '#e6f9ec',
    '#c3efd2',
    '#9fe5b7',
    '#7adb9c',
    '#55d181',
    '#2b8a3e',
    '#237a34',
    '#1b6a2a',
    '#135a20',
    '#0b4a16',
];

const posRed: MantineColorsTuple = [
    '#fde8e8',
    '#f9c4c4',
    '#f5a0a0',
    '#f17c7c',
    '#ed5858',
    '#c92a2a',
    '#b02424',
    '#971e1e',
    '#7e1818',
    '#651212',
];

const posBlue: MantineColorsTuple = [
    '#e3f0fc',
    '#b8d7f7',
    '#8dbef2',
    '#62a5ed',
    '#378ce8',
    '#1864ab',
    '#145896',
    '#104c81',
    '#0c406c',
    '#083457',
];

export const posTheme = createTheme({
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMonospace: '"JetBrains Mono", "Fira Code", monospace',
    headings: {
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '700',
    },
    primaryColor: 'posBlue',
    colors: {
        posGreen,
        posRed,
        posBlue,
    },
    components: {
        Button: {
            defaultProps: {
                radius: 'md',
            },
        },
        TextInput: {
            defaultProps: {
                radius: 'sm',
            },
        },
        Modal: {
            defaultProps: {
                radius: 'md',
                centered: true,
                overlayProps: {
                    backgroundOpacity: 0.65,
                    blur: 3,
                },
            },
        },
    },
});
