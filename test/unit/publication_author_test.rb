require 'test_helper'

class PublicationAuthorTest < ActiveSupport::TestCase

  test "author" do
    name = { :first_name => "Joe", :last_name => "Shmoe"}
    author = PublicationAuthor.new(name)
    assert_equal name[:first_name], author.first_name 
    assert_equal name[:last_name], author.last_name 
    assert_equal name.values.join(" "), author.full_name
  end

  test "split full name" do
    name1 = ["Shmoe"]
    name2 = ["Joe", "Shmoe"]
    name3 = ["Joe", "C.", "Shmoe"]

    firstname1, lastname1 = PublicationAuthor.split_full_name name1.join(" ")
    firstname2, lastname2 = PublicationAuthor.split_full_name name2.join(" ")
    firstname3, lastname3 = PublicationAuthor.split_full_name name3.join(" ")

    assert_equal "", firstname1
    assert_equal name1[0], lastname1

    assert_equal name2[0], firstname2
    assert_equal name2[1], lastname2

    assert_equal name3.slice(0,2).join(" "), firstname3
    assert_equal name3[2], lastname3
  end

end
