import { HTTPStatusCodes } from '../config';
import Mocker from '../mocker';
import { FetchRequestInfo, MockItemInfo } from '../types';
import Base from './base';

export default class FetchInterceptor extends Base{
  private static instance: FetchInterceptor;
  private fetch: any;

  constructor(mocker: Mocker) {
    super(mocker);

    if (FetchInterceptor.instance) {
      return FetchInterceptor.instance;
    }

    FetchInterceptor.instance = this;
    this.fetch = window.fetch.bind(window);
    this.intercept();
    return this;
  }

  static setupForUnitTest(mocker: Mocker) {
    const global = super.global();
    if (!global.fetch) {
      global.fetch = function() {};
    }
    return new FetchInterceptor(mocker);
  }

  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
   * Intercept fetch object.
   */
  private intercept() {
    const me = this;
    window.fetch = function() {
      const args = [ ...(arguments as any) ];
      const [ url, params ] = args;
      const method = params && params.method ? params.method : 'GET';

      return new Promise((resolve, reject) => {
        const match:MockItemInfo | null  = me.matchMockRequest(url, method);
        if (match) {
          const requestInfo = <FetchRequestInfo>{ url, ...params };
          me.doMockRequest(match, requestInfo, resolve);
        } else {
          me.fetch(...args).then(resolve).catch(reject);
        }
      });
    };
    return this;
  }

  /**
   * Make mock request.
   * @param {MockItemInfo} match
   * @param {FetchRequestInfo} requestInfo
   * @param {Function} resolve
   */
  private doMockRequest(match: MockItemInfo, requestInfo: FetchRequestInfo, resolve: Function) {
    if (match.file) {
      import(`${process.env.HRM_MOCK_DIR}/${match.file}`).then((mock) => {
        const mockData = this.formatMockData(mock.default, match, requestInfo);
        this.doMockResponse(mockData, match, resolve);
      });
      return;
    }

    const mockData = this.formatMockData(match.data, match, requestInfo);
    this.doMockResponse(mockData, match, resolve);
  }

  /**
   * Make mock request.
   * @param {MockItemInfo} match
   * @param {FetchRequestInfo} requestInfo
   * @param {Function} resolve
   */
  private doMockResponse(mockData: any, match: MockItemInfo, resolve: Function) {
    if (match) {
      if (match.delay && match.delay > 0) {
        setTimeout(() => {
          resolve(mockData);
        }, +match.delay);
      } else {
        resolve(mockData);
      }
      return;
    }
  }

  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/Response
   * Format mock data.
   * @param {any} mockData
   * @param {MockItemInfo} match
   * @param {FetchRequestInfo} requestInfo
   */
  formatMockData(mockData: any, match: MockItemInfo, requestInfo: FetchRequestInfo) {
    const data = typeof mockData === 'function' ? mockData(requestInfo) : mockData;
    const status = match.status || 200;
    const statusText = HTTPStatusCodes[status] || '';

    const headers = typeof Headers === 'function'
      ? new Headers({ ...match.header, 'is-mock': 'yes' })
      : { ...match.header, 'is-mock': 'yes' };

    const body = typeof Blob === 'function'
      ? new Blob([typeof data === 'string' ? data : JSON.stringify(data)])
      : data;

    if (typeof Response === 'function') {
      const response = new Response(body,{ status, statusText, headers });
      Object.defineProperty(response, 'url', { value: requestInfo.url });
      return response;
    }

    const response = {
      // If you should need some other complex object, you could define it in your mock file.
      body,
      bodyUsed: false,
      headers,
      ok: true,
      redirected: false,
      status,
      statusText,
      url: requestInfo.url,
      type: 'basic', // cors
      // response data depends on prepared data
      json: Promise.resolve(data),
      arrayBuffer: Promise.resolve(data),
      blob: body,
      formData: Promise.resolve(data),
      text: Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
      // other methods that may be used
      clone: async () => response,
      error: async () => response,
      redirect: async () => response,
    };
    return response;
  }
}
