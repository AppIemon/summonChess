import React from 'react';

export const ChessPieces = {
  w: {
    k: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" strokeLinecap="butt" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-5 2-8 2s-4-2-8-2-8 5-8 5-4.5-4-8-2c-3 6 6 10.5 6 10.5v7V37z" fill="#fff" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
        </g>
      </svg>
    ),
    q: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="#fff" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10.5 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM31 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38.5 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" stroke="none" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-13.5V25l-7-11z" strokeLinecap="butt" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 2.5 1 2.5.5 4-2.5 2.5-2.5 4.5-2.5 5.5 10 2.5 21 2.5 31 0 0-1 0-3-2.5-5.5-.5-1.5-.5-1.5.5-4 1-2 2.5-2 2.5-4-8.5-1.5-21-1.5-27 0z" strokeLinecap="butt" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" />
        </g>
      </svg>
    ),
    r: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="#fff" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" strokeLinecap="butt" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5c1 2 2 2 2 2.5S33 35 33 35H12s-.5-1.5 1.5-3c0-.5 1-.5 2-2.5V17" strokeLinecap="butt" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M11 14h23" fill="none" strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    b: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <g fill="#fff" strokeLinecap="butt">
            <path d="M9 36c3.39-.97 9.11-1.45 13.5-1.45 4.38 0 10.11.48 13.5 1.45V30c0-2.35-2.44-4-5-4H14c-2.56 0-5 1.65-5 4v6z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
          </g>
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    n: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff" />
          <path d="M24 18c.38 2.32-.46 4.76-2.25 6.33-1.8 1.57-4.12 1.66-6.03.86-1.9-.8-3.04-2.65-2.66-4.8.38-2.15 2.37-3.7 4.7-3.66 2.34.04 4.14 1.7 4.25 3.27z" fill="#fff" />
          <path d="M9.5 25.5A4.5 4.5 0 1 1 5 25.5 4.5 4.5 0 1 1 9.5 25.5z" fill="#fff" />
          <path d="M15 15.5c-4.5 2.5-8 7-8 10.5 0 2 1.5 4 4 4 2.5 0 5-1.5 5-2.5" fill="#fff" />
          <path d="M9.5 25.5a4.5 4.5 0 1 1-4.5 0 4.5 4.5 0 1 1 4.5 0z" fill="#000" />
        </g>
      </svg>
    ),
    p: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <path d="M22 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-2.78-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  b: {
    k: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" strokeLinecap="butt" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-5 2-8 2s-4-2-8-2-8 5-8 5-4.5-4-8-2c-3 6 6 10.5 6 10.5v7V37z" fill="#000" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff" />
        </g>
      </svg>
    ),
    q: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="#000" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10.5 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM31 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38.5 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" stroke="none" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-13.5V25l-7-11z" strokeLinecap="butt" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 2.5 1 2.5.5 4-2.5 2.5-2.5 4.5-2.5 5.5 10 2.5 21 2.5 31 0 0-1 0-3-2.5-5.5-.5-1.5-.5-1.5.5-4 1-2 2.5-2 2.5-4-8.5-1.5-21-1.5-27 0z" strokeLinecap="butt" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#fff" />
        </g>
      </svg>
    ),
    r: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="#000" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" strokeLinecap="butt" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5c1 2 2 2 2 2.5S33 35 33 35H12s-.5-1.5 1.5-3c0-.5 1-.5 2-2.5V17" strokeLinecap="butt" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M11 14h23" fill="none" stroke="#fff" strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    b: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <g fill="#000" strokeLinecap="butt">
            <path d="M9 36c3.39-.97 9.11-1.45 13.5-1.45 4.38 0 10.11.48 13.5 1.45V30c0-2.35-2.44-4-5-4H14c-2.56 0-5 1.65-5 4v6z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
          </g>
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" strokeLinejoin="miter" />
        </g>
      </svg>
    ),
    n: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#000" />
          <path d="M24 18c.38 2.32-.46 4.76-2.25 6.33-1.8 1.57-4.12 1.66-6.03.86-1.9-.8-3.04-2.65-2.66-4.8.38-2.15 2.37-3.7 4.7-3.66 2.34.04 4.14 1.7 4.25 3.27z" fill="#000" />
          <path d="M9.5 25.5A4.5 4.5 0 1 1 5 25.5 4.5 4.5 0 1 1 9.5 25.5z" fill="#000" />
          <path d="M15 15.5c-4.5 2.5-8 7-8 10.5 0 2 1.5 4 4 4 2.5 0 5-1.5 5-2.5" fill="#000" />
          <path d="M9.5 25.5a4.5 4.5 0 1 1-4.5 0 4.5 4.5 0 1 1 4.5 0z" fill="#fff" />
        </g>
      </svg>
    ),
    p: (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" {...props}>
        <path d="M22 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-2.78-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
};
