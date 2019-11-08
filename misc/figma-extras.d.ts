// Extra things normally found in DOM which are included in the Figma plugin environment

declare var console: Console;

interface Console {

  // Note: Commented-out properties are unavailble in Figma plugins

  assert(condition?: boolean, message?: string, ...data: any[]): void;
  clear(): void;
  // count(label?: string): void;
  // debug(message?: any, ...optionalParams: any[]): void;
  // dir(value?: any, ...optionalParams: any[]): void;
  // dirxml(value: any): void;
  error(message?: any, ...optionalParams: any[]): void;
  // exception(message?: string, ...optionalParams: any[]): void;
  // group(groupTitle?: string, ...optionalParams: any[]): void;
  // groupCollapsed(groupTitle?: string, ...optionalParams: any[]): void;
  // groupEnd(): void;
  info(message?: any, ...optionalParams: any[]): void;
  log(message?: any, ...optionalParams: any[]): void;
  // markTimeline(label?: string): void;
  // memory: any;
  // profile(reportName?: string): void;
  // profileEnd(reportName?: string): void;
  // table(...tabularData: any[]): void;
  // time(label?: string): void;
  // timeEnd(label?: string): void;
  // timeline(label?: string): void;
  // timelineEnd(label?: string): void;
  // timeStamp(label?: string): void;
  // trace(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
}
