import os
import io
import zipfile
import pytest
from unittest import mock
from datetime import date
from ingestion import nse_zcyc_client
from ingestion.fbil_client import RawObservationBatch, FetchFailure

@pytest.fixture
def mock_session():
    with mock.patch("requests.Session") as mock_class:
        session_instance = mock_class.return_value
        yield session_instance

def create_dummy_zip_content(filename="zcyc_20012010.xls"):
    """Creates a valid zip archive in memory containing a dummy text file."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr(filename, b"Dummy XLS Binary Content")
    return zip_buffer.getvalue()

def test_fetch_invalid_date_format():
    result = nse_zcyc_client.fetch("2026/07/10")
    assert isinstance(result, FetchFailure)
    assert "Invalid date format" in result.reason

def test_fetch_http_error(mock_session):
    # Mock home page warm-up succeeds
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=404, text="Not Found") # API call
    ]
    
    result = nse_zcyc_client.fetch("2010-01-20")
    assert isinstance(result, FetchFailure)
    assert "HTTP error status: 404" in result.reason

def test_fetch_invalid_zip(mock_session):
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=b"Not a zip file content", text="Not a zip file content") # API call
    ]
    
    result = nse_zcyc_client.fetch("2010-01-20")
    assert isinstance(result, FetchFailure)
    assert "Response content is not a valid ZIP file" in result.reason

def test_fetch_empty_zip(mock_session):
    # Valid ZIP but no files
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        pass
    empty_zip_content = zip_buffer.getvalue()
    
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=empty_zip_content) # API call
    ]
    
    result = nse_zcyc_client.fetch("2010-01-20")
    assert isinstance(result, FetchFailure)
    assert "ZIP file is empty" in result.reason

def test_fetch_no_xls_in_zip(mock_session):
    dummy_zip = create_dummy_zip_content(filename="not_an_xls.csv")
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=dummy_zip) # API call
    ]
    
    result = nse_zcyc_client.fetch("2010-01-20")
    assert isinstance(result, FetchFailure)
    assert "No Excel .xls file found in ZIP" in result.reason

@mock.patch("xlrd.open_workbook")
def test_fetch_missing_sheet_calc(mock_open_workbook, mock_session):
    dummy_zip = create_dummy_zip_content()
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=dummy_zip) # API call
    ]
    
    # Mock workbook sheet list
    mock_book = mock.Mock()
    mock_book.sheet_names.return_value = ["HELP", "model"]
    mock_open_workbook.return_value = mock_book
    
    result = nse_zcyc_client.fetch("2010-01-20")
    assert isinstance(result, FetchFailure)
    assert "Sheet 'calc' not found" in result.reason

@mock.patch("xlrd.open_workbook")
def test_fetch_date_not_found_in_headers(mock_open_workbook, mock_session):
    dummy_zip = create_dummy_zip_content()
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=dummy_zip) # API call
    ]
    
    mock_sheet = mock.Mock()
    mock_sheet.nrows = 5
    mock_sheet.ncols = 3
    # Dates: Column 1 is 40197.0 (2010-01-19), Column 2 is 40198.0 (2010-01-20)
    cells = {
        (0, 0): "",       (0, 1): 40197.0,   (0, 2): 40198.0,
    }
    mock_sheet.cell_value.side_effect = lambda r, c: cells.get((r, c), "")
    
    mock_book = mock.Mock()
    mock_book.sheet_names.return_value = ["calc"]
    mock_book.sheet_by_name.return_value = mock_sheet
    mock_book.datemode = 0
    mock_open_workbook.return_value = mock_book
    
    # Request a date that is not in headers (e.g. 2010-01-22)
    result = nse_zcyc_client.fetch("2010-01-22")
    assert isinstance(result, FetchFailure)
    assert "Requested date 2010-01-22 not found" in result.reason

@mock.patch("xlrd.open_workbook")
def test_fetch_success(mock_open_workbook, mock_session):
    dummy_zip = create_dummy_zip_content()
    mock_session.get.side_effect = [
        mock.Mock(status_code=200), # Warm up
        mock.Mock(status_code=200, content=dummy_zip) # API call
    ]
    
    mock_sheet = mock.Mock()
    mock_sheet.nrows = 5
    mock_sheet.ncols = 3
    # Row 0: Header dates: 40197.0 (2010-01-19) and 40198.0 (2010-01-20)
    # Tenor rows (Col 0: tenor, Col 1: yields 2010-01-19, Col 2: yields 2010-01-20)
    cells = {
        (0, 0): "",       (0, 1): 40197.0,   (0, 2): 40198.0,
        (1, 0): 0.25,     (1, 1): 5.1906,    (1, 2): 4.0239,
        (2, 0): 0.50,     (2, 1): 5.3415,    (2, 2): 4.3893,
        (3, 0): 10.00,    (3, 1): 8.1808,    (3, 2): 8.0772,
        (4, 0): 20.00,    (4, 1): 8.9630,    (4, 2): 8.4794,
    }
    mock_sheet.cell_value.side_effect = lambda r, c: cells.get((r, c), 0.0)
    
    mock_book = mock.Mock()
    mock_book.sheet_names.return_value = ["calc"]
    mock_book.sheet_by_name.return_value = mock_sheet
    mock_book.datemode = 0
    mock_open_workbook.return_value = mock_book
    
    # Fetch for 2010-01-20
    result = nse_zcyc_client.fetch("2010-01-20")
    
    assert isinstance(result, RawObservationBatch)
    assert result.date == "2010-01-20"
    assert result.source == "nse_zcyc"
    
    # 12 tenors mapped (with flat extrapolation for > 20Y)
    assert len(result.observations) == 12
    
    # Check specific tenor values
    obs_map = {obs["tenor_label"]: obs for obs in result.observations}
    
    # 91D (0.25Y) matches 0.25 row yield (4.0239)
    assert obs_map["91D"]["par_yield"] == 4.0239
    
    # 182D (0.50Y) matches 0.50 row yield (4.3893)
    assert obs_map["182D"]["par_yield"] == 4.3893
    
    # 10Y (10.0Y) matches 10.0 row yield (8.0772)
    assert obs_map["10Y"]["par_yield"] == 8.0772
    
    # 30Y and 40Y should be flatly extrapolated to 20Y row yield (8.4794)
    assert obs_map["30Y"]["par_yield"] == 8.4794
    assert obs_map["40Y"]["par_yield"] == 8.4794
