import http.client
import json
import unittest
import test_server as fixtures


class EventApiTests(unittest.TestCase):
    setUp=fixtures.ChangePasswordTests.setUp
    tearDown=fixtures.ChangePasswordTests.tearDown
    authorize=fixtures.AdminTests.authorize
    def call(self,method,path,data=None,token='active'):
        connection=http.client.HTTPConnection('127.0.0.1',self.http.server_port)
        connection.request(method,path,json.dumps(data) if data is not None else None,{'Content-Type':'application/json','Cookie':'solvai_session='+token})
        response=connection.getresponse();result=response.status,json.loads(response.read());connection.close();return result
    def test_authentication_roles_and_missing_contract(self):
        self.assertEqual(self.call('GET','/api/research/events',token='missing')[0],401)
        self.assertEqual(self.call('GET','/api/research/events')[1]['studies'],[])
        self.assertEqual(self.call('POST','/api/admin/events/evidence',{})[0],403)
        self.assertEqual(self.call('POST','/api/research/events',{})[0],400)
        self.assertEqual(self.call('POST','/api/research/events/resolve',{'version_id':'another'})[0],400)
        self.authorize();self.assertEqual(self.call('POST','/api/admin/events/evidence',{},token='admin')[0],400)
