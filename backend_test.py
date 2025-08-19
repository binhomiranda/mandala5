#!/usr/bin/env python3
"""
Backend Testing Suite for WebGL Mandala Generator
Tests FastAPI backend endpoints, database connectivity, and service health
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, Any

# Load backend URL from frontend .env
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    base_url = line.split('=', 1)[1].strip()
                    return f"{base_url}/api"
        return "https://mandala-forge.preview.emergentagent.com/api"
    except Exception as e:
        print(f"Warning: Could not read frontend .env file: {e}")
        return "https://mandala-forge.preview.emergentagent.com/api"

BACKEND_URL = get_backend_url()
print(f"Testing backend at: {BACKEND_URL}")

class BackendTester:
    def __init__(self):
        self.backend_url = BACKEND_URL
        self.test_results = []
        self.session = requests.Session()
        self.session.timeout = 10
        
    def log_test(self, test_name: str, success: bool, message: str, details: Dict[Any, Any] = None):
        """Log test results"""
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'details': details or {}
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_health_endpoint(self):
        """Test basic health endpoint"""
        try:
            response = self.session.get(f"{self.backend_url}/")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "Hello World":
                    self.log_test("Health Endpoint", True, "Root endpoint responding correctly")
                    return True
                else:
                    self.log_test("Health Endpoint", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_test("Health Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("Health Endpoint", False, f"Connection error: {str(e)}")
            return False
    
    def test_cors_headers(self):
        """Test CORS configuration"""
        try:
            response = self.session.options(f"{self.backend_url}/")
            
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
            }
            
            if cors_headers['Access-Control-Allow-Origin']:
                self.log_test("CORS Configuration", True, "CORS headers present", cors_headers)
                return True
            else:
                self.log_test("CORS Configuration", False, "Missing CORS headers", cors_headers)
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("CORS Configuration", False, f"Connection error: {str(e)}")
            return False
    
    def test_status_post_endpoint(self):
        """Test POST /status endpoint"""
        try:
            test_data = {
                "client_name": "WebGL_Mandala_Test_Client"
            }
            
            response = self.session.post(
                f"{self.backend_url}/status",
                json=test_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['id', 'client_name', 'timestamp']
                
                if all(field in data for field in required_fields):
                    if data['client_name'] == test_data['client_name']:
                        self.log_test("POST Status Endpoint", True, "Status creation successful", {
                            'status_id': data['id'],
                            'client_name': data['client_name']
                        })
                        return data['id']  # Return ID for further testing
                    else:
                        self.log_test("POST Status Endpoint", False, "Client name mismatch", data)
                        return None
                else:
                    self.log_test("POST Status Endpoint", False, f"Missing required fields: {required_fields}", data)
                    return None
            else:
                self.log_test("POST Status Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            self.log_test("POST Status Endpoint", False, f"Connection error: {str(e)}")
            return None
    
    def test_status_get_endpoint(self):
        """Test GET /status endpoint"""
        try:
            response = self.session.get(f"{self.backend_url}/status")
            
            if response.status_code == 200:
                data = response.json()
                
                if isinstance(data, list):
                    self.log_test("GET Status Endpoint", True, f"Retrieved {len(data)} status records")
                    return True
                else:
                    self.log_test("GET Status Endpoint", False, f"Expected list, got: {type(data)}")
                    return False
            else:
                self.log_test("GET Status Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("GET Status Endpoint", False, f"Connection error: {str(e)}")
            return False
    
    def test_database_connectivity(self):
        """Test database operations by creating and retrieving data"""
        try:
            # Create a test record
            test_client_name = f"DB_Test_Client_{int(time.time())}"
            
            # POST data
            post_response = self.session.post(
                f"{self.backend_url}/status",
                json={"client_name": test_client_name},
                headers={"Content-Type": "application/json"}
            )
            
            if post_response.status_code != 200:
                self.log_test("Database Connectivity", False, "Failed to create test record")
                return False
            
            created_record = post_response.json()
            
            # GET data to verify persistence
            get_response = self.session.get(f"{self.backend_url}/status")
            
            if get_response.status_code != 200:
                self.log_test("Database Connectivity", False, "Failed to retrieve records")
                return False
            
            records = get_response.json()
            
            # Check if our test record exists
            test_record_found = any(
                record.get('client_name') == test_client_name 
                for record in records
            )
            
            if test_record_found:
                self.log_test("Database Connectivity", True, "Database read/write operations successful", {
                    'test_record_id': created_record.get('id'),
                    'total_records': len(records)
                })
                return True
            else:
                self.log_test("Database Connectivity", False, "Test record not found in database")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("Database Connectivity", False, f"Connection error: {str(e)}")
            return False
    
    def test_error_handling(self):
        """Test error handling for invalid requests"""
        try:
            # Test invalid JSON
            response = self.session.post(
                f"{self.backend_url}/status",
                data="invalid json",
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code in [400, 422]:  # Bad Request or Unprocessable Entity
                self.log_test("Error Handling", True, "Invalid JSON properly rejected")
                return True
            else:
                self.log_test("Error Handling", False, f"Expected 400/422, got {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("Error Handling", False, f"Connection error: {str(e)}")
            return False
    
    def test_response_times(self):
        """Test API response times"""
        try:
            start_time = time.time()
            response = self.session.get(f"{self.backend_url}/")
            end_time = time.time()
            
            response_time = (end_time - start_time) * 1000  # Convert to milliseconds
            
            if response.status_code == 200:
                if response_time < 5000:  # Less than 5 seconds
                    self.log_test("Response Time", True, f"Response time: {response_time:.2f}ms")
                    return True
                else:
                    self.log_test("Response Time", False, f"Slow response: {response_time:.2f}ms")
                    return False
            else:
                self.log_test("Response Time", False, f"HTTP {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.log_test("Response Time", False, f"Connection error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 60)
        print("BACKEND TESTING SUITE - WebGL Mandala Generator")
        print("=" * 60)
        print(f"Backend URL: {self.backend_url}")
        print(f"Test started at: {datetime.now().isoformat()}")
        print("-" * 60)
        
        tests = [
            self.test_health_endpoint,
            self.test_cors_headers,
            self.test_response_times,
            self.test_status_post_endpoint,
            self.test_status_get_endpoint,
            self.test_database_connectivity,
            self.test_error_handling
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                result = test()
                if result:
                    passed += 1
            except Exception as e:
                print(f"❌ FAIL {test.__name__}: Unexpected error: {str(e)}")
        
        print("-" * 60)
        print(f"BACKEND TEST SUMMARY: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL BACKEND TESTS PASSED - Backend is stable and ready")
            return True
        else:
            print(f"⚠️  {total - passed} tests failed - Backend issues detected")
            return False
    
    def get_summary(self):
        """Get test summary"""
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        
        return {
            'total_tests': total,
            'passed': passed,
            'failed': total - passed,
            'success_rate': (passed / total * 100) if total > 0 else 0,
            'results': self.test_results
        }

def main():
    """Main test execution"""
    tester = BackendTester()
    success = tester.run_all_tests()
    
    # Print detailed results
    print("\n" + "=" * 60)
    print("DETAILED TEST RESULTS")
    print("=" * 60)
    
    summary = tester.get_summary()
    
    for result in summary['results']:
        status = "✅" if result['success'] else "❌"
        print(f"{status} {result['test']}: {result['message']}")
        if result['details'] and not result['success']:
            print(f"   Details: {result['details']}")
    
    print(f"\nOverall Success Rate: {summary['success_rate']:.1f}%")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())