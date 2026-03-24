import axios from 'axios';
import { config } from '../config';

/**
 * Angel One SmartAPI Client
 * Handles authentication & API calls to Angel One broker
 */
export class AngelOneClient {
  private baseUrl = config.angelOne.apiUrl;
  private apiKey = config.angelOne.apiKey;

  async login(clientId: string, password: string, totp: string): Promise<{
    accessToken: string;
    refreshToken: string;
    feedToken: string;
  }> {
    try {
      const response = await axios.post(`${this.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, {
        clientcode: clientId,
        password,
        totp,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': this.apiKey,
        },
      });

      if (!response.data?.data?.jwtToken) {
        throw new Error(response.data?.message || 'Login failed');
      }

      return {
        accessToken: response.data.data.jwtToken,
        refreshToken: response.data.data.refreshToken,
        feedToken: response.data.data.feedToken,
      };
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { message?: string } }; message?: string };
      throw new Error(`Angel One login failed: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getHoldings(accessToken: string): Promise<unknown[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/rest/secure/angelbroking/portfolio/v1/getHolding`, {
        headers: this.getAuthHeaders(accessToken),
      });
      return response.data?.data || [];
    } catch (error: unknown) {
      const axiosErr = error as { message?: string };
      throw new Error(`Failed to fetch holdings: ${axiosErr.message}`);
    }
  }

  async placeOrder(accessToken: string, order: {
    variety: string;
    tradingsymbol: string;
    symboltoken: string;
    transactiontype: string;
    exchange: string;
    ordertype: string;
    producttype: string;
    duration: string;
    price: string;
    quantity: string;
  }): Promise<{ orderId: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/rest/secure/angelbroking/order/v1/placeOrder`,
        order,
        { headers: this.getAuthHeaders(accessToken) }
      );

      if (!response.data?.data?.orderid) {
        throw new Error(response.data?.message || 'Order placement failed');
      }

      return { orderId: response.data.data.orderid };
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { message?: string } }; message?: string };
      throw new Error(`Order failed: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getOrderBook(accessToken: string): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/rest/secure/angelbroking/order/v1/getOrderBook`,
        { headers: this.getAuthHeaders(accessToken) }
      );
      return response.data?.data || [];
    } catch (error: unknown) {
      const axiosErr = error as { message?: string };
      throw new Error(`Failed to fetch order book: ${axiosErr.message}`);
    }
  }

  async cancelOrder(accessToken: string, variety: string, orderId: string): Promise<{ orderId: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/rest/secure/angelbroking/order/v1/cancelOrder`,
        { variety, orderid: orderId },
        { headers: this.getAuthHeaders(accessToken) }
      );
      return { orderId: response.data?.data?.orderid || orderId };
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { message?: string } }; message?: string };
      throw new Error(`Cancel order failed: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  /**
   * Fetch LTP / quote data from Angel One Market API
   * Docs: POST /rest/secure/angelbroking/market/v1/quote/
   * mode: LTP | OHLC | FULL
   */
  async getMarketQuote(
    accessToken: string,
    exchange: string,
    symbolToken: string,
    mode: 'LTP' | 'OHLC' | 'FULL' = 'FULL',
  ): Promise<{
    ltp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> {
    try {
      // Angel One exchange segments: NSE = "NSE", BSE = "BSE", NFO = "NFO"
      const exchangeMap: Record<string, string> = {
        NSE: 'NSE',
        BSE: 'BSE',
        NFO: 'NFO',
        BFO: 'BFO',
        MCX: 'MCX',
        CDS: 'CDS',
      };
      const segment = exchangeMap[exchange] || exchange;

      const response = await axios.post(
        `${this.baseUrl}/rest/secure/angelbroking/market/v1/quote/`,
        {
          mode,
          exchangeTokens: {
            [segment]: [symbolToken],
          },
        },
        { headers: this.getAuthHeaders(accessToken), timeout: 5000 },
      );

      if (!response.data?.data?.fetched?.length) {
        throw new Error(response.data?.message || 'No quote data returned');
      }

      const quote = response.data.data.fetched[0];
      return {
        ltp: parseFloat(quote.ltp) || 0,
        open: parseFloat(quote.open) || 0,
        high: parseFloat(quote.high) || 0,
        low: parseFloat(quote.low) || 0,
        close: parseFloat(quote.close) || 0,
        volume: parseInt(quote.tradeVolume || quote.volume || '0', 10),
      };
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { message?: string }; status?: number }; message?: string };
      const msg = axiosErr.response?.data?.message || axiosErr.message || 'Quote fetch failed';
      const status = axiosErr.response?.status;
      const err = new Error(`Angel One quote failed: ${msg}`) as Error & { statusCode?: number };
      if (status === 401 || status === 403) err.statusCode = 401;
      throw err;
    }
  }

  async refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/rest/auth/angelbroking/jwt/v1/generateTokens`,
        { refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-PrivateKey': this.apiKey,
          },
        }
      );

      return {
        accessToken: response.data?.data?.jwtToken,
        refreshToken: response.data?.data?.refreshToken,
      };
    } catch (error: unknown) {
      const axiosErr = error as { message?: string };
      throw new Error(`Token refresh failed: ${axiosErr.message}`);
    }
  }

  private getAuthHeaders(accessToken: string) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-PrivateKey': this.apiKey,
      'Authorization': `Bearer ${accessToken}`,
    };
  }
}
