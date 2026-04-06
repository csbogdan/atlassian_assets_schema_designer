import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans"',
          'Helvetica', 'Arial', 'sans-serif',
        ],
      },
      borderRadius: {
        none: '0',
        sm: '3px',
        DEFAULT: '3px',
        md: '3px',
        lg: '4px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 1px rgba(9,30,66,0.25), 0 0 1px rgba(9,30,66,0.31)',
        DEFAULT: '0 1px 1px rgba(9,30,66,0.25), 0 0 1px rgba(9,30,66,0.31)',
        md: '0 3px 5px rgba(9,30,66,0.2), 0 0 1px rgba(9,30,66,0.31)',
        lg: '0 8px 16px rgba(9,30,66,0.15), 0 0 1px rgba(9,30,66,0.31)',
        xl: '0 20px 32px rgba(9,30,66,0.12), 0 0 1px rgba(9,30,66,0.31)',
        none: 'none',
      },
      colors: {
        // Atlassian Neutral (replaces slate)
        slate: {
          50:  '#F7F8F9',
          100: '#F1F2F4',
          200: '#DCDFE4',
          300: '#B3BAC5',
          400: '#8590A2',
          500: '#626F86',
          600: '#44546F',
          700: '#2C3E5D',
          800: '#1C2B41',
          900: '#172B4D',
          950: '#091E42',
        },
        // Atlassian Blue (replaces blue)
        blue: {
          50:  '#E9F2FF',
          100: '#CCE0FF',
          200: '#85B8FF',
          300: '#4C9AFF',
          400: '#2684FF',
          500: '#1D7AFC',
          600: '#0C66E4',
          700: '#0052CC',
          800: '#0747A6',
          900: '#09326C',
          950: '#082145',
        },
        // Atlassian Red (errors)
        red: {
          50:  '#FFECEB',
          100: '#FFBDAD',
          200: '#FF8F73',
          300: '#FF7452',
          400: '#FF5630',
          500: '#E2483D',
          600: '#C9372C',
          700: '#AE2E24',
          800: '#8D1F18',
          900: '#601E16',
          950: '#391713',
        },
        // Atlassian Amber/Yellow (warnings)
        amber: {
          50:  '#FFF7D6',
          100: '#F8E6A0',
          200: '#F5CD47',
          300: '#E2B203',
          400: '#CF9F02',
          500: '#B38600',
          600: '#946F00',
          700: '#7F5F01',
          800: '#533F04',
          900: '#3D2E00',
          950: '#2E2200',
        },
        // Atlassian Green (success)
        emerald: {
          50:  '#DCFFF1',
          100: '#BAF3DB',
          200: '#7EE2B8',
          300: '#4BCE97',
          400: '#2ABB7F',
          500: '#22A06B',
          600: '#1F845A',
          700: '#216E4E',
          800: '#164B35',
          900: '#133527',
          950: '#0D2B1D',
        },
        // Atlassian Teal/Sky (info)
        sky: {
          50:  '#E6FCFF',
          100: '#C1F0F6',
          200: '#8BDBE5',
          300: '#60C6D2',
          400: '#37B4C3',
          500: '#1D9AAA',
          600: '#1D7F8C',
          700: '#206B74',
          800: '#1D474C',
          900: '#153337',
          950: '#0D2326',
        },
        // Atlassian Purple
        violet: {
          50:  '#F3F0FF',
          100: '#DFD8FD',
          200: '#B8ACF6',
          300: '#9F8FEF',
          400: '#8777D9',
          500: '#6E5DC6',
          600: '#5E4DB2',
          700: '#4B3D99',
          800: '#352C7A',
          900: '#221B5E',
          950: '#150F44',
        },
      },
    },
  },
  plugins: [],
};

export default config;
