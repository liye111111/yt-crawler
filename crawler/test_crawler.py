import http.client
import io
import json
import unittest
from unittest.mock import patch

import crawler


class FakeResponse:
    def __init__(self, payload):
        self.body = io.BytesIO(json.dumps(payload).encode("utf-8"))

    def __enter__(self):
        return self.body

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class RequestChildrenTest(unittest.TestCase):
    @patch("crawler.time.sleep")
    @patch("crawler.urllib.request.urlopen")
    def test_retries_remote_disconnect(self, urlopen, sleep):
        expected = [{"id": "1"}]
        urlopen.side_effect = [
            http.client.RemoteDisconnected("closed without response"),
            FakeResponse(expected),
        ]

        result = crawler.request_children("123", 4, timeout=2, retries=1)

        self.assertEqual(expected, result)
        self.assertEqual(2, urlopen.call_count)
        sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
