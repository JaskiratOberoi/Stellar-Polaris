import type { Page } from 'puppeteer';

export type { Page };

export type PagerInfo = {
  currentPage: number;
  allPages: { number: number }[];
};
