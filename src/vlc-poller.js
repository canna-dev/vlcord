import axios from 'axios';
import { retryWithBackoff } from './retry-helper.js';

export class VLCPoller {
  constructor(config) {
    this.config = config;
  }

  async fetchStatus() {
    const response = await retryWithBackoff(
      async () => {
        return await axios.get(
          `http://${this.config.host}:${this.config.port}/requests/status.json`,
          {
            auth: {
              username: '',
              password: this.config.password,
            },
            timeout: 3000,
          }
        );
      },
      2,
      300
    );
    return response.data;
  }
}

export default VLCPoller;
